import os
import sys
import secrets
import copy
import itertools
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import threading
import time
import json
from typing import Dict, List

# 确定静态文件目录（支持便携版）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
STATIC_DIR = os.path.join(SCRIPT_DIR, "web", "dist")

from api.base import Chaoxing, Account, StudyResult
from api.answer import Tiku
from api.exceptions import LoginError
from api.logger import logger
import main as main_module

# 如果存在构建好的前端，则使用静态文件服务
if os.path.exists(STATIC_DIR):
    app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
else:
    app = Flask(__name__)

# 仅允许本机前端（Vite dev server 与 Flask 自身）跨域访问
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]
CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

# Web 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "web_config.json")


def load_web_config() -> Dict:
  """加载前端保存的配置"""
  if not os.path.exists(CONFIG_FILE):
      return {}
  try:
      with open(CONFIG_FILE, "r", encoding="utf-8") as f:
          return json.load(f)
  except Exception as e:
      logger.error(f"读取 Web 配置失败: {e}")
      return {}


def save_web_config(data: Dict) -> bool:
  """保存前端配置到本地 JSON 文件"""
  try:
      tmp_path = CONFIG_FILE + ".tmp"
      with open(tmp_path, "w", encoding="utf-8") as f:
          json.dump(data, f, ensure_ascii=False, indent=2)
      os.replace(tmp_path, CONFIG_FILE)
      return True
  except Exception as e:
      logger.error(f"保存 Web 配置失败: {e}")
      return False


# 存储学习任务状态
task_status: Dict[str, dict] = {}

# 任务详细信息缓存
task_details: Dict[str, dict] = {}

# ==================== 会话（凭据只留在后端内存，不下发也不落盘） ====================

# 敏感字段掩码：前端回显该常量表示「维持原值」，后端在写入前还原为已保存的真实值
MASKED_VALUE = "__MASKED__"

# 会话有效期（秒）。超期后需要重新登录。
SESSION_TTL = 12 * 3600
# 单个会话内缓存的超星实例最长空闲时间（秒）
SESSION_IDLE_TTL = 30 * 60

# session_id -> {username, password, use_cookies, chaoxing, created_at, last_used}
SESSIONS: Dict[str, dict] = {}
SESSIONS_LOCK = threading.RLock()
# 保护缓存内 Chaoxing 实例的调用（实例本身不是为并发设计的）
CHAOXING_LOCK = threading.RLock()

# 每个任务的日志独立保存，避免多任务/多标签页互相抢占
TASK_LOGS: Dict[str, List[dict]] = {}
TASK_LOGS_LOCK = threading.RLock()
MAX_TASK_LOGS = 5000
# 单条日志的最大长度，防止异常堆栈把内存撑爆
MAX_LOG_MESSAGE_LEN = 2000
# 全局单调递增的日志序号，供前端增量拉取与断点续传
_LOG_SEQ = itertools.count(1)


def mask_value(value):
    """非空值统一替换为掩码标记；空值保持空。"""
    if value is None or value == "":
        return value
    return MASKED_VALUE


# 敏感字段路径（相对 settings 节点），题库 Token / 各类 API Key / 内嵌密钥的通知 URL
SENSITIVE_SETTINGS_PATHS = (
    ("tiku_config", "tokens"),
    ("tiku_config", "key"),
    ("ocr_config", "key"),
    ("notification_config", "url"),
)


def _get_nested(cfg: Dict, path):
    node = cfg
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return None, False
        node = node[key]
    return node, True


def _set_nested(cfg: Dict, path, value):
    node = cfg
    for key in path[:-1]:
        if not isinstance(node.get(key), dict):
            node[key] = {}
        node = node[key]
    node[path[-1]] = value


def mask_config_for_response(data: Dict) -> Dict:
    """GET /api/config 的响应：抹掉敏感字段原值，仅保留掩码。"""
    if not isinstance(data, dict):
        return {}

    result = copy.deepcopy(data)
    settings = result.get("settings")
    if isinstance(settings, dict):
        for path in SENSITIVE_SETTINGS_PATHS:
            value, present = _get_nested(settings, path)
            if present:
                _set_nested(settings, path, mask_value(value))
    return result


def _resolve_masked_node(incoming, saved, paths):
    """把 incoming 中等于掩码的字段还原为 saved 中的真实值。

    前端只会拿到掩码，用户未修改该字段时提交上来的就是掩码本身，
    此时必须沿用磁盘上的原值，否则会把凭据覆盖成 "__MASKED__"。
    """
    if not isinstance(incoming, dict):
        return incoming

    result = copy.deepcopy(incoming)
    for path in paths:
        value, present = _get_nested(result, path)
        if present and value == MASKED_VALUE:
            saved_value, saved_present = _get_nested(saved or {}, path)
            # 磁盘上没有原值则掩码无意义，置空避免污染
            _set_nested(result, path, saved_value if saved_present else "")
    return result


def resolve_masked_config(incoming: Dict, saved: Dict) -> Dict:
    """/api/config 形态：敏感字段位于 {settings: {...}} 之下。"""
    if not isinstance(incoming, dict):
        return incoming
    result = copy.deepcopy(incoming)
    settings = result.get("settings")
    if isinstance(settings, dict):
        saved_settings = saved.get("settings") if isinstance(saved, dict) else None
        result["settings"] = _resolve_masked_node(settings, saved_settings, SENSITIVE_SETTINGS_PATHS)
    return result


def resolve_masked_start_payload(incoming: Dict, saved: Dict) -> Dict:
    """/api/start 形态：敏感字段与 settings 平铺在同一层。"""
    saved_settings = None
    if isinstance(saved, dict) and isinstance(saved.get("settings"), dict):
        saved_settings = saved["settings"]
    return _resolve_masked_node(incoming, saved_settings, SENSITIVE_SETTINGS_PATHS)


def _safe_float(value, default: float, low: float, high: float) -> float:
    """把入参转成 [low, high] 内的浮点数，None/非法值回退到 default。"""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:  # NaN
        return default
    return min(high, max(low, number))


def _safe_int(value, default: int, low: int, high: int) -> int:
    """把入参转成 [low, high] 内的整数，None/非法值回退到 default。"""
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return min(high, max(low, number))


def normalize_chapter_selection(raw) -> Dict:
    """规整章节选择配置，丢弃非法结构。

    契约：{"<courseId>": {"mode": "all"|"custom", "ids": ["<chapterId>", ...]}}
    兼容裸 list 简写 {"<courseId>": ["id1", "id2"]}（等价于 mode=custom）。
    """
    if not isinstance(raw, dict):
        return {}

    result: Dict[str, dict] = {}
    for course_id, value in raw.items():
        key = str(course_id or '').strip()
        if not key:
            continue

        if isinstance(value, list):
            result[key] = {
                'mode': 'custom',
                'ids': [str(x) for x in value if str(x or '').strip()],
            }
            continue

        if not isinstance(value, dict):
            continue

        mode = value.get('mode') or 'all'
        if mode not in ('all', 'custom'):
            mode = 'all'
        ids = value.get('ids')
        if not isinstance(ids, list):
            ids = []

        result[key] = {
            'mode': mode,
            'ids': [str(x) for x in ids if str(x or '').strip()],
        }

    return result


# ==================== 会话读写辅助 ====================

def _purge_expired_sessions(now: float = None):
    now = now if now is not None else time.time()
    expired = [sid for sid, s in SESSIONS.items() if now - s.get("last_used", 0) > SESSION_TTL]
    for sid in expired:
        SESSIONS.pop(sid, None)
    # 会话数量上限，避免长期运行堆积
    if len(SESSIONS) > 32:
        ordered = sorted(SESSIONS.items(), key=lambda kv: kv[1].get("last_used", 0))
        for sid, _ in ordered[: len(SESSIONS) - 32]:
            SESSIONS.pop(sid, None)


def create_session(username: str, password: str, use_cookies: bool) -> str:
    session_id = secrets.token_urlsafe(24)
    now = time.time()
    with SESSIONS_LOCK:
        _purge_expired_sessions(now)
        SESSIONS[session_id] = {
            "username": username or "",
            "password": password or "",
            "use_cookies": bool(use_cookies),
            "chaoxing": None,
            "chaoxing_at": 0.0,
            "created_at": now,
            "last_used": now,
        }
    return session_id


def get_session(session_id: str):
    """取出会话并刷新活跃时间；无效或过期返回 None。"""
    if not session_id:
        return None
    now = time.time()
    with SESSIONS_LOCK:
        session = SESSIONS.get(session_id)
        if not session:
            return None
        if now - session.get("last_used", 0) > SESSION_TTL:
            SESSIONS.pop(session_id, None)
            return None
        session["last_used"] = now
        return session


def drop_session(session_id: str) -> bool:
    if not session_id:
        return False
    with SESSIONS_LOCK:
        return SESSIONS.pop(session_id, None) is not None


def get_session_chaoxing(session: dict):
    """返回会话内缓存的超星实例，必要时重建。

    调用方需要在 CHAOXING_LOCK 保护下使用返回的实例。
    """
    now = time.time()
    chaoxing = session.get("chaoxing")
    fresh = chaoxing is not None and (now - session.get("chaoxing_at", 0)) <= SESSION_IDLE_TTL
    if not fresh:
        account = Account(session.get("username") or "", session.get("password") or "")
        chaoxing = Chaoxing(account=account, tiku=Tiku(), query_delay=0)
        login_result = chaoxing.login(login_with_cookies=session.get("use_cookies", False))
        if not login_result.get("status"):
            session["chaoxing"] = None
            return None, login_result.get("msg") or "登录失败"
        session["chaoxing"] = chaoxing
        session["chaoxing_at"] = now
    session["chaoxing_at"] = now
    return chaoxing, None


def resolve_credentials(payload: Dict):
    """从请求体中解析凭据来源。

    返回 (session_id, credentials, error_response)：
      - 命中有效会话时 credentials 为 {'username','password','use_cookies','session'}
      - 否则回退到请求体里的 username/password（兼容脚本与旧调用方）
    """
    payload = payload or {}
    session_id = payload.get("session_id") or payload.get("sessionId") or ""
    session = get_session(session_id)
    if session:
        return session_id, {
            "username": session.get("username") or "",
            "password": session.get("password") or "",
            "use_cookies": bool(session.get("use_cookies")),
            "session": session,
        }, None

    use_cookies = bool(payload.get("use_cookies", False))
    username = payload.get("username") or ""
    password = payload.get("password") or ""
    if not use_cookies and (not username or not password):
        return session_id, None, (
            jsonify({"status": False, "msg": "登录状态已失效，请重新登录"}), 401
        )
    return session_id, {
        "username": username,
        "password": password,
        "use_cookies": use_cookies,
        "session": None,
    }, None


class LogCapture:
    """捕获日志输出"""
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.logs = []

    def write(self, message):
        # loguru 传入的是 Message 对象，这里统一转成字符串再处理
        text = str(message).strip()
        if not text:
            return
        if len(text) > MAX_LOG_MESSAGE_LEN:
            text = text[:MAX_LOG_MESSAGE_LEN] + " …(已截断)"
        timestamp = time.time()
        self.logs.append({
            'time': timestamp,
            'message': text
        })
        with TASK_LOGS_LOCK:
            bucket = TASK_LOGS.setdefault(self.task_id, [])
            bucket.append({
                'seq': next(_LOG_SEQ),
                'message': text,
                'timestamp': timestamp,
            })
            if len(bucket) > MAX_TASK_LOGS:
                del bucket[: len(bucket) - MAX_TASK_LOGS]

@app.route('/api/login', methods=['POST'])
def login():
    """用户登录接口

    登录成功后下发 session_id。账号密码只保留在后端内存里，
    前端仅持久化 session_id，因此刷新页面无需重新输入密码。
    """
    try:
        data = request.get_json(silent=True) or {}
        username = data.get('username') or ''
        password = data.get('password') or ''
        use_cookies = bool(data.get('use_cookies', False))

        # Cookie登录不需要用户名密码
        if not use_cookies and (not username or not password):
            return jsonify({'status': False, 'msg': '用户名或密码不能为空'}), 400

        account = Account(username, password)
        chaoxing = Chaoxing(account=account, tiku=Tiku(), query_delay=0)

        login_result = chaoxing.login(login_with_cookies=use_cookies)

        if not login_result.get('status'):
            return jsonify({'status': False, 'msg': login_result.get('msg') or '登录失败'}), 401

        session_id = create_session(username, password, use_cookies)
        with SESSIONS_LOCK:
            session = SESSIONS.get(session_id)
            if session is not None:
                # 复用刚刚验证过的实例，避免紧接着又登录一次
                session['chaoxing'] = chaoxing
                session['chaoxing_at'] = time.time()

        return jsonify({
            'status': True,
            'msg': '登录成功',
            'data': {
                'session_id': session_id,
                'username': username,
                'use_cookies': use_cookies,
            }
        })

    except Exception as e:
        logger.error(f"登录错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500


@app.route('/api/session', methods=['GET', 'POST'])
def current_session():
    """校验会话是否仍然有效，供前端刷新页面后恢复登录态。

    只从请求体读取 session_id，**刻意不支持 URL 参数**：session_id 等价于 bearer
    凭据，一旦出现在 query string 就会被写入访问日志（werkzeug 会记录完整 URL）
    并进入浏览器历史。保留 GET 方法只是为了让裸 GET 得到 401 而不是 405。
    """
    payload = request.get_json(silent=True) or {}
    session_id = payload.get('session_id') or payload.get('sessionId') or ''
    session = get_session(session_id)
    if not session:
        return jsonify({'status': False, 'msg': '登录状态已失效，请重新登录'}), 401

    return jsonify({
        'status': True,
        'data': {
            'username': session.get('username') or '',
            'use_cookies': bool(session.get('use_cookies')),
        }
    })


@app.route('/api/logout', methods=['POST'])
def logout():
    """手动登出：销毁服务端会话。"""
    payload = request.get_json(silent=True) or {}
    session_id = payload.get('session_id') or payload.get('sessionId') or ''
    drop_session(session_id)
    return jsonify({'status': True, 'msg': '已退出登录'})

@app.route('/api/courses', methods=['POST'])
def get_courses():
    """获取课程列表

    优先使用会话内缓存的超星登录态，避免每次接口都重新登录。
    """
    try:
        data = request.get_json(silent=True) or {}
        _, cred, err = resolve_credentials(data)
        if err:
            return err

        session = cred['session']
        if session is not None:
            with CHAOXING_LOCK:
                chaoxing, login_error = get_session_chaoxing(session)
                if chaoxing is None:
                    return jsonify({'status': False, 'msg': login_error or '登录失败'}), 401
                courses = chaoxing.get_course_list()
        else:
            account = Account(cred['username'], cred['password'])
            chaoxing = Chaoxing(account=account, tiku=Tiku(), query_delay=0)
            login_result = chaoxing.login(login_with_cookies=cred['use_cookies'])
            if not login_result.get('status'):
                return jsonify({'status': False, 'msg': '登录失败'}), 401
            courses = chaoxing.get_course_list()

        return jsonify({
            'status': True,
            'data': courses
        })

    except Exception as e:
        logger.error(f"获取课程列表错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500


@app.route('/api/chapters', methods=['POST'])
def get_chapters():
    """获取指定课程的章节列表（用于前端章节选择）"""
    try:
        data = request.get_json(silent=True) or {}

        # 兼容两种入参：扁平字段，或直接传课程对象
        course = data.get('course') or {}
        course_id = str(course.get('courseId') or data.get('courseId') or data.get('course_id') or '').strip()
        clazz_id = str(course.get('clazzId') or data.get('clazzId') or data.get('clazz_id') or '').strip()
        cpi = str(course.get('cpi') or data.get('cpi') or '').strip()

        if not (course_id and clazz_id and cpi):
            return jsonify({
                'status': False,
                'msg': '缺少课程参数：需要 courseId、clazzId、cpi'
            }), 400

        _, cred, err = resolve_credentials(data)
        if err:
            return err

        session = cred['session']
        if session is not None:
            with CHAOXING_LOCK:
                chaoxing, login_error = get_session_chaoxing(session)
                if chaoxing is None:
                    return jsonify({'status': False, 'msg': login_error or '登录失败'}), 401
                point_list = chaoxing.get_course_point(course_id, clazz_id, cpi)
        else:
            account = Account(cred['username'], cred['password'])
            chaoxing = Chaoxing(account=account, tiku=Tiku(), query_delay=0)
            login_result = chaoxing.login(login_with_cookies=cred['use_cookies'])
            if not login_result.get('status'):
                return jsonify({'status': False, 'msg': '登录失败'}), 401
            point_list = chaoxing.get_course_point(course_id, clazz_id, cpi)

        points = point_list.get('points', []) or []

        chapters = []
        for point in points:
            try:
                job_count = int(point.get('jobCount', 1) or 1)
            except (TypeError, ValueError):
                job_count = 1

            chapters.append({
                'id': str(point.get('id', '')),
                'title': point.get('title', ''),
                'jobCount': job_count,
                'has_finished': bool(point.get('has_finished', False)),
                'need_unlock': bool(point.get('need_unlock', False)),
            })

        return jsonify({
            'status': True,
            'data': {
                'chapters': chapters,
                'hasLocked': bool(point_list.get('hasLocked', False)),
            }
        })

    except Exception as e:
        logger.error(f"获取章节列表错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500


@app.route('/api/config', methods=['GET', 'POST'])
def web_config():
    if request.method == 'GET':
        data = load_web_config()
        # 敏感字段只回传掩码，避免明文凭据出现在响应体里
        return jsonify({'status': True, 'data': mask_config_for_response(data)})

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'status': False, 'msg': '配置格式错误'}), 400

    # 入参中的掩码表示「用户没有修改该字段」，写盘前还原为已保存的真实值
    resolved = resolve_masked_config(data, load_web_config())

    if not save_web_config(resolved):
        return jsonify({'status': False, 'msg': '保存失败'}), 500

    return jsonify({'status': True, 'msg': '保存成功'})

@app.route('/api/start', methods=['POST'])
def start_study():
    """开始学习任务"""
    try:
        data = request.get_json(silent=True) or {}

        # ① 凭据：优先复用会话，回退到请求体（兼容脚本/CLI 调用）
        _, cred, err = resolve_credentials(data)
        if err:
            return err
        username = cred['username']
        password = cred['password']
        use_cookies = cred['use_cookies']

        # ② 课程列表必须非空：为空时任务会在后台空转（历史上还会阻塞在 stdin 的 input()）
        raw_course_list = data.get('course_list')
        if raw_course_list is None:
            raw_course_list = []
        if not isinstance(raw_course_list, list):
            return jsonify({'status': False, 'msg': 'course_list 必须是数组'}), 400
        course_list = [str(c).strip() for c in raw_course_list if str(c or '').strip()]
        if not course_list:
            return jsonify({
                'status': False,
                'msg': '没有可学习的课程：请先成功加载课程列表，并至少选择一门课程'
            }), 400

        # ③ 数值参数：None/非法值回退默认，越界夹取（前端清空输入也不会再把 null 传进来）
        speed = _safe_float(data.get('speed'), 1.0, 1.0, 2.0)
        jobs = _safe_int(data.get('jobs'), 4, 1, 10)

        notopen_action = data.get('notopen_action', 'retry')
        if notopen_action not in ('retry', 'ask', 'continue'):
            notopen_action = 'retry'

        # ④ 凭据类字段：请求体里是掩码时还原为磁盘上的真实值
        incoming = resolve_masked_start_payload(data, load_web_config())
        tiku_config = incoming.get('tiku_config') or {}
        notification_config = incoming.get('notification_config') or {}
        ocr_config = incoming.get('ocr_config') or {}

        # 章节选择配置：{"<courseId>": {"mode": "all"|"custom", "ids": [...]}}
        # 缺省或 mode=all 表示学习该课程全部章节
        chapter_selection = normalize_chapter_selection(data.get('chapter_selection'))

        # 设置 OCR 配置环境变量
        if ocr_config.get('provider') and ocr_config.get('key'):
            os.environ['CHAOXING_VISION_OCR_PROVIDER'] = ocr_config['provider']
            os.environ['CHAOXING_VISION_OCR_KEY'] = ocr_config['key']
            if ocr_config.get('endpoint'):
                os.environ['CHAOXING_VISION_OCR_ENDPOINT'] = ocr_config['endpoint']
            if ocr_config.get('model'):
                os.environ['CHAOXING_VISION_OCR_MODEL'] = ocr_config['model']
            # 重置 vision_ocr 模块的配置缓存，使新配置生效
            try:
                from api.vision_ocr import reset_vision_ocr_config
                reset_vision_ocr_config()
            except ImportError:
                pass
            logger.info(f"已配置外部 AI 视觉 OCR: provider={ocr_config['provider']}")

        # 创建任务ID（不含账号，避免用户名出现在 URL、日志与前端展示中）
        task_id = f"task-{time.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"
        
        # 初始化任务状态
        task_status[task_id] = {
            'status': 'running',
            'progress': 0,
            'total': 0,
            'current_course': '',
            'current_chapter': '',
            'current_task': '',
            'logs': [],
            'start_time': time.time(),
            'stats': {
                'total_chapters': 0,
                'completed_chapters': 0,
                'skipped_chapters': 0,
                'total_tasks': 0,
                'completed_tasks': 0,
                'failed_tasks': 0,
                'skipped_tasks': 0
            }
        }
        
        # 初始化任务详细信息
        task_details[task_id] = {
            'courses': [],  # 存储每个课程的详细信息
            'active_jobs': {}  # 存储活跃的视频任务进度
        }
        
        # 构建配置（speed/jobs 已在校验阶段归一化，这里不再重复 clamp）
        common_config = {
            'username': username or '',
            'password': password or '',
            'course_list': course_list,
            'speed': speed,
            'jobs': jobs,
            'notopen_action': notopen_action,
            'use_cookies': use_cookies,
            # 供 main.process_course 过滤章节使用
            'chapter_selection': chapter_selection
        }
        
        # 在后台线程中运行学习任务
        def run_task():
            from api.notification import Notification
            import traceback
            
            notification = None
            # 为当前任务注册日志捕获，将 loguru 日志通过 LogCapture 推送到前端
            capture = LogCapture(task_id)
            log_sink_id = logger.add(capture.write, enqueue=True)
            
            def update_video_progress(course, job, current_time, duration):
                """更新视频播放进度"""
                try:
                    if task_id in task_details:
                        task_details[task_id]['active_jobs'][job['jobid']] = {
                            'course_name': course['title'],
                            'job_name': job.get('name', '未知任务'),
                            'current_time': current_time,
                            'duration': duration,
                            'progress': (current_time / duration * 100) if duration > 0 else 0,
                            'timestamp': time.time()
                        }
                        
                        # 清理太久没有更新的任务（例如已完成或异常退出的）
                        current_ts = time.time()
                        expired_jobs = []
                        for jid, info in task_details[task_id]['active_jobs'].items():
                            if current_ts - info['timestamp'] > 10:  # 10秒无更新视为非活跃
                                expired_jobs.append(jid)
                        for jid in expired_jobs:
                            task_details[task_id]['active_jobs'].pop(jid, None)
                except Exception:
                    pass

            try:
                # 初始化超星实例
                chaoxing = main_module.init_chaoxing(common_config, tiku_config)
                
                # 注入回调
                common_config['video_progress_callback'] = update_video_progress
                login_result = chaoxing.login(login_with_cookies=common_config.get('use_cookies', False))
                
                if not login_result['status']:
                    task_status[task_id]['status'] = 'error'
                    task_status[task_id]['error'] = '登录失败'
                    return
                
                # 设置外部通知
                notification = Notification()
                notification.config_set(notification_config)
                notification = notification.get_notification_from_config()
                notification.init_notification()
                
                all_courses = chaoxing.get_course_list()
                course_task = main_module.filter_courses(all_courses, course_list)

                task_status[task_id]['total'] = len(course_task)

                # 初始化课程详情
                for course in course_task:
                    task_details[task_id]['courses'].append({
                        'id': course['courseId'],
                        'title': course['title'],
                        'status': 'pending',
                        'chapters': [],
                        'start_time': None,
                        'end_time': None
                    })

                # 为 main.process_course 配置章节开始/完成的回调，用于实时更新章节与任务统计
                def chapter_start_callback(course_obj, point_obj):
                    try:
                        # 更新当前课程与章节名称，便于前端展示“正在学习”信息
                        task_status[task_id]['current_course'] = course_obj.get('title', task_status[task_id].get('current_course', ''))
                        task_status[task_id]['current_chapter'] = point_obj.get('title', '')
                    except Exception as e:
                        logger.debug(f"更新当前章节状态失败: {e}")

                def chapter_done_callback(course_obj, point_obj):
                    try:
                        if task_id not in task_status or task_id not in task_details:
                            return

                        stats = task_status[task_id]['stats']
                        courses_detail = task_details[task_id]['courses']
                        course_id = course_obj.get('courseId')

                        target_course = None
                        for c in courses_detail:
                            if c.get('id') == course_id:
                                target_course = c
                                break

                        if not target_course:
                            return

                        chapters = target_course.get('chapters', [])
                        for chapter in chapters:
                            if chapter.get('id') == point_obj.get('id'):
                                try:
                                    job_count = int(chapter.get('jobCount', 1) or 1)
                                except (TypeError, ValueError):
                                    job_count = 1

                                if not chapter.get('has_finished'):
                                    # 正常完成的章节
                                    chapter['has_finished'] = True
                                    chapter['status'] = 'completed'
                                    stats['completed_chapters'] += 1
                                    stats['completed_tasks'] += job_count
                                elif chapter.get('status') == 'pending' or chapter.get('status') == 'skipped':
                                    # 服务器已标记完成但前端尚未记录 → 视为跳过（防重复学习）
                                    chapter['has_finished'] = True
                                    chapter['status'] = 'skipped'
                                    stats['skipped_chapters'] += 1
                                    stats['completed_tasks'] += job_count
                                break
                    except Exception as e:
                        logger.debug(f"更新章节统计失败: {e}")

                # 将回调注入 common_config，供 main.process_course / process_chapter 使用
                common_config['chapter_start_callback'] = chapter_start_callback
                common_config['chapter_done_callback'] = chapter_done_callback

                for idx, course in enumerate(course_task):
                    course_detail = task_details[task_id]['courses'][idx]
                    course_detail['status'] = 'running'
                    course_detail['start_time'] = time.time()
                    
                    task_status[task_id]['current_course'] = course['title']
                    task_status[task_id]['progress'] = idx
                    
                    # 获取章节信息并处理
                    try:
                        point_list = chaoxing.get_course_point(
                            course['courseId'], course['clazzId'], course['cpi']
                        )

                        all_points = point_list.get('points', []) or []

                        # 与 process_course 使用同一份章节过滤逻辑，保证统计口径与实际执行一致
                        points = main_module.filter_points(
                            all_points, course, common_config, verbose=False
                        )
                        stats = task_status[task_id]['stats']

                        # 统计总章节数（按章节选择过滤后的口径）
                        stats['total_chapters'] += len(points)

                        # 提示章节选择是否生效
                        if len(points) != len(all_points):
                            logger.info(
                                f"[{course['title']}] 章节选择生效: 共 {len(all_points)} 章, 本次学习 {len(points)} 章"
                            )

                        # 记录章节信息与任务数量
                        for point in points:
                            has_finished = point.get('has_finished', False)
                            # jobCount 来自 decode_course_point，表示章节内任务数量，缺失时按 1 计
                            try:
                                job_count = int(point.get('jobCount', 1) or 1)
                            except (TypeError, ValueError):
                                job_count = 1

                            chapter_info = {
                                'id': point.get('id'),
                                'title': point.get('title', ''),
                                'status': 'completed' if has_finished else 'pending',
                                'has_finished': has_finished,
                                'jobCount': job_count,
                            }
                            course_detail['chapters'].append(chapter_info)

                            # 累计任务统计
                            stats['total_tasks'] += job_count
                            if has_finished:
                                stats['completed_chapters'] += 1
                                stats['completed_tasks'] += job_count

                        # 处理课程（原有逻辑，但章节/任务统计通过回调实时更新）
                        main_module.process_course(chaoxing, course, common_config)

                        # 课程处理完成后，确保已完成的章节状态为 completed（统计已在回调中完成）
                        for chapter in course_detail['chapters']:
                            if chapter.get('has_finished'):
                                chapter['status'] = 'completed'

                        course_detail['status'] = 'completed'
                        course_detail['end_time'] = time.time()

                    except Exception as course_error:
                        logger.error(f"课程处理失败 {course['title']}: {course_error}")
                        course_detail['status'] = 'error'
                        course_detail['error'] = str(course_error)
                        course_detail['end_time'] = time.time()
                    
                    task_status[task_id]['progress'] = idx + 1
                
                task_status[task_id]['status'] = 'completed'
                
                # 发送完成通知
                if notification:
                    notification.send("超星学习通: 所有课程学习任务已完成")
                
            except Exception as e:
                logger.error(f"任务执行错误: {e}")
                task_status[task_id]['status'] = 'error'
                task_status[task_id]['error'] = str(e)
                
                # 发送错误通知
                if notification:
                    try:
                        notification.send(f"超星学习通: 出现错误 {type(e).__name__}: {e}\n{traceback.format_exc()}")
                    except Exception:
                        pass
            finally:
                # 无论任务成功或失败，都移除当前任务的日志捕获 sink
                try:
                    logger.remove(log_sink_id)
                except Exception:
                    pass
        
        thread = threading.Thread(target=run_task, daemon=True)
        thread.start()
        
        return jsonify({
            'status': True,
            'data': {
                'task_id': task_id
            }
        })
        
    except Exception as e:
        logger.error(f"启动任务错误: {e}")
        return jsonify({'status': False, 'msg': str(e)}), 500

@app.route('/api/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """获取任务状态"""
    if task_id not in task_status:
        return jsonify({'status': False, 'msg': '任务不存在'}), 404
    
    return jsonify({
        'status': True,
        'data': task_status[task_id]
    })

@app.route('/api/task/<task_id>/details', methods=['GET'])
def get_task_details(task_id):
    """获取任务详细信息"""
    if task_id not in task_details:
        return jsonify({'status': False, 'msg': '任务详情不存在'}), 404
    
    return jsonify({
        'status': True,
        'data': task_details[task_id]
    })

def _classify_log_level(message: str) -> str:
    upper = message.upper()
    if 'ERROR' in upper or '错误' in message or '失败' in message:
        return 'error'
    if 'WARNING' in upper or '警告' in message:
        return 'warning'
    if 'SUCCESS' in upper or '成功' in message or '完成' in message:
        return 'success'
    return 'info'


@app.route('/api/logs/<task_id>', methods=['GET'])
def get_logs(task_id):
    """获取任务日志（支持 since 游标增量拉取）

    - 日志按 task_id 隔离存放，不再从全局队列里排空别的任务的条目
    - ?since=<seq> 只返回该序号之后的增量，前端不再重复拉取整份日志
    - 日志被裁剪导致序号不连续时返回 dropped=true，前端据此重置游标
    """
    try:
        since = int(request.args.get('since', 0))
    except (TypeError, ValueError):
        since = 0
    if since < 0:
        since = 0

    with TASK_LOGS_LOCK:
        bucket = list(TASK_LOGS.get(task_id, ()))

    entries = [entry for entry in bucket if entry.get('seq', 0) > since]
    next_cursor = entries[-1]['seq'] if entries else since
    dropped = bool(bucket) and bucket[0].get('seq', 0) > since + 1
    # 服务端当前保留的最早序号；为 None 表示该任务没有任何日志（例如后端刚重启）
    first_seq = bucket[0].get('seq') if bucket else None

    logs = [
        {
            'message': entry.get('message', ''),
            'level': _classify_log_level(entry.get('message', '')),
            'timestamp': entry.get('timestamp', time.time()),
        }
        for entry in entries
    ]

    return jsonify({
        'status': True,
        'data': logs,
        'next': next_cursor,
        'first': first_seq,
        'dropped': dropped,
    })

@app.route('/api/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': True, 'msg': 'OK'})


# ==================== 静态文件服务（便携版支持） ====================

@app.route('/')
def serve_index():
    """服务前端首页"""
    if os.path.exists(STATIC_DIR):
        return send_from_directory(STATIC_DIR, 'index.html')
    return jsonify({'status': False, 'msg': '前端未构建，请访问 http://localhost:5173 使用开发模式'}), 404


@app.route('/<path:path>')
def serve_static(path):
    """服务静态文件，支持 SPA 客户端路由"""
    if os.path.exists(STATIC_DIR):
        # 如果请求的是 API 路径，跳过（已被上面的路由处理）
        if path.startswith('api/'):
            return jsonify({'status': False, 'msg': 'Not Found'}), 404
        
        # 尝试提供静态文件
        file_path = os.path.join(STATIC_DIR, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(STATIC_DIR, path)
        
        # 对于 SPA 客户端路由，返回 index.html
        return send_from_directory(STATIC_DIR, 'index.html')
    
    return jsonify({'status': False, 'msg': '前端未构建'}), 404


if __name__ == "__main__":
    # 仅监听本机回环地址：该服务会读写本地配置与凭据，不应暴露到局域网
    HOST = os.environ.get("CHAOXING_HOST", "127.0.0.1")
    PORT = int(os.environ.get("CHAOXING_PORT", "5000"))
    # debug 默认关闭（Werkzeug 调试器可执行任意代码）；本地排障时可用 CHAOXING_DEBUG=1 临时开启
    DEBUG = os.environ.get("CHAOXING_DEBUG", "").strip() in ("1", "true", "True")

    if HOST in ("0.0.0.0", "::"):
        logger.warning(
            f"当前监听 {HOST}，局域网内其他设备可访问本服务（含配置与凭据接口），请确认这是预期行为"
        )

    # 检测是否存在前端构建
    if os.path.exists(STATIC_DIR):
        logger.info(f"检测到前端构建，将提供静态文件服务: {STATIC_DIR}")
        logger.info(f"请在浏览器中打开: http://localhost:{PORT}")
    else:
        logger.info("未检测到前端构建，仅提供 API 服务")
        logger.info("前端开发模式请访问: http://localhost:3000")

    # use_reloader=False 避免热重载导致后台线程 ThreadPoolExecutor 崩溃
    app.run(host=HOST, port=PORT, debug=DEBUG, use_reloader=False)
