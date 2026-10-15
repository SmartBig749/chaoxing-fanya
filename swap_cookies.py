# -*- coding: utf-8 -*-
"""安全替换 cookies.txt。

用法:
    python swap_cookies.py <来源文件>

来源文件支持多种导出格式，会自动识别:
    - 原始字符串:      "a=1; b=2"
    - JSON 数组:       [{"name": "a", "value": "1"}, ...]
    - JSON 对象:       {"a": "1", "b": "2"}
    - Netscape TSV:    浏览器扩展导出的 7 列 tab 分隔格式

替换前会校验必需字段并备份原文件。脚本只改磁盘上的 cookies.txt，
进程内的登录态需要重启服务才会重新读取。
"""
import json
import os
import re
import shutil
import sys
import time

TARGET = "cookies.txt"
REQUIRED = ("_uid", "fid", "vc3", "uf")


def parse(source: str) -> dict:
    text = source.strip()
    if not text:
        raise ValueError("来源文件为空")

    if text.startswith("[") or text.startswith("{"):
        data = json.loads(text)
        if isinstance(data, dict) and "cookies" in data:
            data = data["cookies"]
        pairs = (
            [(c["name"], c["value"]) for c in data]
            if isinstance(data, list)
            else list(data.items())
        )
        return {str(k).strip(): str(v).strip() for k, v in pairs}

    if "\t" in text or text.startswith("#"):
        cookies = {}
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                cookies[parts[5]] = parts[6]
        if not cookies:
            raise ValueError("未能从 Netscape 格式中解析出 cookie")
        return cookies

    cookies = {}
    for item in text.split(";"):
        item = item.strip().rstrip(",")
        if not item:
            continue
        if "=" not in item:
            raise ValueError(f"条目缺少 '=': {item!r}")
        # 只按第一个 '=' 切分，值里带 '=' 的在这里补齐
        k, v = item.split("=", 1)
        cookies[k.strip().strip('"')] = v.strip().strip('"')
    return cookies


def to_app_format(cookies: dict) -> str:
    out = []
    for k, v in cookies.items():
        if "=" in v:
            # 项目用 split("=") 解包恰好两个值，值里带 '=' 会直接抛异常；
            # 站点自身对这类值就是用 %3D 编码的，所以这里对齐同一约定。
            v = v.replace("=", "%3D")
        out.append(f"{k}={v}")
    return ";".join(out)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    src = sys.argv[1]
    if not os.path.isfile(src):
        print(f"找不到来源文件: {src}")
        return 2

    with open(src, encoding="utf-8") as f:
        cookies = parse(f.read())

    missing = [k for k in REQUIRED if k not in cookies]
    if missing:
        print(f"缺少必需字段: {', '.join(missing)}")
        print(f"实际解析到的字段: {', '.join(cookies) or '(空)'}")
        print("请确认导出的是 chaoxing.com 域下的完整 cookie。")
        return 1

    new_line = to_app_format(cookies)

    if os.path.exists(TARGET):
        bak = f"{TARGET}.bak.{int(time.time())}"
        shutil.copy2(TARGET, bak)
        print(f"已备份原文件 -> {bak}")

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(new_line)

    print(f"已写入 {TARGET}")
    print(f"  cookie 数量: {len(cookies)}")
    print(f"  账号 _uid: {cookies['_uid']}")
    print(f"  学校 fid: {cookies['fid']}")

    tok = cookies.get("p_auth_token", "")
    if tok.count(".") == 2:
        import base64
        payload = tok.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        try:
            info = json.loads(base64.urlsafe_b64decode(payload))
            exp = int(info.get("exp", 0))
            state = "已过期" if exp < time.time() else "有效"
            print(f"  p_auth_token 过期于: "
                  f"{time.strftime('%Y-%m-%d %H:%M', time.localtime(exp))} ({state})")
        except Exception:
            pass

    print("\n下一步: 重启后端服务，让进程重新读取 cookies.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
