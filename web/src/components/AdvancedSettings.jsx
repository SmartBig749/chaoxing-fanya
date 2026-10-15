import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';
import Input from './ui/Input';
import Select from './ui/Select';
import Field from './ui/Field';
import { Settings2, Database, Bell, Eye } from 'lucide-react';

const MASK_HINT = '已保存的凭据以掩码回显；保持不动即沿用原值，清空则删除。';

const TIKU_PROVIDERS = [
  { value: '', label: '不使用题库' },
  { value: 'TikuYanxi', label: '言溪题库' },
  { value: 'TikuLike', label: 'LIKE知识库' },
  { value: 'TikuAdapter', label: 'TikuAdapter' },
  { value: 'AI', label: 'AI大模型' },
  { value: 'SiliconFlow', label: '硅基流动AI' },
];

const TIKU_SUBMIT_OPTIONS = [
  { value: 'false', label: '仅保存，不提交' },
  { value: 'true', label: '达到覆盖率自动提交' },
];

const NOTIFICATION_PROVIDERS = [
  { value: '', label: '不使用通知' },
  { value: 'ServerChan', label: 'Server酱' },
  { value: 'Qmsg', label: 'Qmsg酱' },
  { value: 'Bark', label: 'Bark' },
  { value: 'Telegram', label: 'Telegram' },
];

const OCR_PROVIDERS = [
  { value: '', label: '不使用图片 OCR' },
  { value: 'openai', label: 'OpenAI (GPT-4o)' },
  { value: 'claude', label: 'Claude 3 (Anthropic)' },
  { value: 'qwen', label: '通义千问 VL' },
  { value: 'siliconflow', label: '硅基流动 (推荐国内)' },
  { value: 'openai_compatible', label: 'OpenAI 兼容 API' },
];

const AdvancedSettings = ({ settings, onChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleTikuChange = (field, value) => {
    onChange({
      ...settings,
      tiku_config: {
        ...settings.tiku_config,
        [field]: value,
      },
    });
  };

  const handleNotificationChange = (field, value) => {
    onChange({
      ...settings,
      notification_config: {
        ...settings.notification_config,
        [field]: value,
      },
    });
  };

  const handleOcrChange = (field, value) => {
    onChange({
      ...settings,
      ocr_config: {
        ...(settings.ocr_config || {}),
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        aria-expanded={showAdvanced}
        aria-controls="advanced-settings-panel"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center text-sm text-primary hover:text-primary/80 font-medium"
      >
        <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
        {showAdvanced ? '隐藏高级配置' : '显示高级配置'}
      </button>

      {showAdvanced && (
        <div id="advanced-settings-panel" className="space-y-4">
          {/* 题库配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Database className="mr-2 h-5 w-5" aria-hidden="true" />
                题库配置
              </CardTitle>
              <CardDescription>配置题库用于章节检测自动答题（可选）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="tiku-provider" label="题库提供商">
                <Select
                  id="tiku-provider"
                  options={TIKU_PROVIDERS}
                  value={settings.tiku_config?.provider || ''}
                  onChange={(e) => handleTikuChange('provider', e.target.value)}
                />
              </Field>

              {settings.tiku_config?.provider && (
                <>
                  <Field id="tiku-tokens" label="Token" hint={`多个token用逗号分隔。${MASK_HINT}`}>
                    <Input
                      id="tiku-tokens"
                      type="password"
                      autoComplete="off"
                      placeholder="多个token用逗号分隔"
                      value={settings.tiku_config?.tokens || ''}
                      onChange={(e) => handleTikuChange('tokens', e.target.value)}
                    />
                  </Field>

                  <Field id="tiku-submit" label="自动提交答题">
                    <Select
                      id="tiku-submit"
                      options={TIKU_SUBMIT_OPTIONS}
                      value={settings.tiku_config?.submit || 'false'}
                      onChange={(e) => handleTikuChange('submit', e.target.value)}
                    />
                  </Field>

                  <Field id="tiku-cover-rate" label="最低题库覆盖率" hint="范围: 0.0 - 1.0，推荐0.9">
                    <Input
                      id="tiku-cover-rate"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.tiku_config?.cover_rate || 0.9}
                      onChange={(e) => handleTikuChange('cover_rate', parseFloat(e.target.value))}
                    />
                  </Field>

                  <Field id="tiku-delay" label="查询延迟（秒）" hint="题库查询间隔时间">
                    <Input
                      id="tiku-delay"
                      type="number"
                      min="0"
                      step="0.5"
                      value={settings.tiku_config?.delay || 1.0}
                      onChange={(e) => handleTikuChange('delay', parseFloat(e.target.value))}
                    />
                  </Field>

                  {/* AI 配置 */}
                  {(settings.tiku_config?.provider === 'AI' ||
                    settings.tiku_config?.provider === 'SiliconFlow') && (
                    <>
                      <Field id="ai-endpoint" label="API Endpoint">
                        <Input
                          id="ai-endpoint"
                          type="text"
                          placeholder="https://api.example.com/v1"
                          value={settings.tiku_config?.endpoint || ''}
                          onChange={(e) => handleTikuChange('endpoint', e.target.value)}
                        />
                      </Field>

                      <Field id="ai-key" label="API Key" hint={MASK_HINT}>
                        <Input
                          id="ai-key"
                          type="password"
                          autoComplete="off"
                          placeholder="your-api-key"
                          value={settings.tiku_config?.key || ''}
                          onChange={(e) => handleTikuChange('key', e.target.value)}
                        />
                      </Field>

                      <Field id="ai-model" label="模型名称">
                        <Input
                          id="ai-model"
                          type="text"
                          placeholder="gpt-3.5-turbo"
                          value={settings.tiku_config?.model || ''}
                          onChange={(e) => handleTikuChange('model', e.target.value)}
                        />
                      </Field>

                      <Field id="ai-min-interval" label="请求最小间隔（秒）">
                        <Input
                          id="ai-min-interval"
                          type="number"
                          min="0"
                          step="0.1"
                          value={
                            typeof settings.tiku_config?.min_interval_seconds === 'number'
                              ? settings.tiku_config.min_interval_seconds
                              : 3
                          }
                          onChange={(e) =>
                            handleTikuChange('min_interval_seconds', parseFloat(e.target.value) || 0)
                          }
                        />
                      </Field>

                      <Field id="ai-concurrency" label="单卷最大并发题目数">
                        <Input
                          id="ai-concurrency"
                          type="number"
                          min="1"
                          max="10"
                          step="1"
                          value={settings.tiku_config?.ai_concurrency || 3}
                          onChange={(e) =>
                            handleTikuChange('ai_concurrency', parseInt(e.target.value, 10) || 1)
                          }
                        />
                      </Field>
                    </>
                  )}

                  {/* TikuAdapter 配置 */}
                  {settings.tiku_config?.provider === 'TikuAdapter' && (
                    <Field id="adapter-url" label="TikuAdapter URL">
                      <Input
                        id="adapter-url"
                        type="text"
                        placeholder="http://localhost:8080"
                        value={settings.tiku_config?.url || ''}
                        onChange={(e) => handleTikuChange('url', e.target.value)}
                      />
                    </Field>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 通知配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Bell className="mr-2 h-5 w-5" aria-hidden="true" />
                外部通知配置
              </CardTitle>
              <CardDescription>任务完成或出错时推送通知（可选）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="notification-provider" label="通知服务">
                <Select
                  id="notification-provider"
                  options={NOTIFICATION_PROVIDERS}
                  value={settings.notification_config?.provider || ''}
                  onChange={(e) => handleNotificationChange('provider', e.target.value)}
                />
              </Field>

              {settings.notification_config?.provider && (
                <>
                  <Field id="notification-url" label="通知URL" hint={`URL 内嵌的密钥会被掩码保护。${MASK_HINT}`}>
                    <Input
                      id="notification-url"
                      type="password"
                      autoComplete="off"
                      placeholder="https://..."
                      value={settings.notification_config?.url || ''}
                      onChange={(e) => handleNotificationChange('url', e.target.value)}
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    {settings.notification_config?.provider === 'ServerChan' && 'https://sctapi.ftqq.com/YOUR_KEY.send'}
                    {settings.notification_config?.provider === 'Qmsg' && 'https://qmsg.zendee.cn/send/YOUR_KEY'}
                    {settings.notification_config?.provider === 'Bark' && 'https://api.day.app/YOUR_KEY/'}
                    {settings.notification_config?.provider === 'Telegram' && 'https://api.telegram.org/botYOUR_TOKEN/sendMessage'}
                  </p>

                  {settings.notification_config?.provider === 'Telegram' && (
                    <Field id="tg-chat-id" label="Chat ID">
                      <Input
                        id="tg-chat-id"
                        type="text"
                        placeholder="123456789"
                        value={settings.notification_config?.tg_chat_id || ''}
                        onChange={(e) => handleNotificationChange('tg_chat_id', e.target.value)}
                      />
                    </Field>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 图片 OCR 配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Eye className="mr-2 h-5 w-5" aria-hidden="true" />
                图片 OCR 配置
              </CardTitle>
              <CardDescription>配置 AI 视觉模型识别题目图片中的文字/公式（可选）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="ocr-provider"
                label="OCR 提供商"
                hint="用于识别题目中的图片（如数学公式），提升答题准确率"
              >
                <Select
                  id="ocr-provider"
                  options={OCR_PROVIDERS}
                  value={settings.ocr_config?.provider || ''}
                  onChange={(e) => handleOcrChange('provider', e.target.value)}
                />
              </Field>

              {settings.ocr_config?.provider && (
                <>
                  <Field
                    id="ocr-key"
                    label="API Key"
                    hint={[
                      settings.ocr_config?.provider === 'siliconflow' && '硅基流动 API Key，可在 siliconflow.cn 获取',
                      settings.ocr_config?.provider === 'openai' && 'OpenAI API Key',
                      settings.ocr_config?.provider === 'claude' && 'Anthropic API Key',
                      settings.ocr_config?.provider === 'qwen' && '阿里云 DashScope API Key',
                      settings.ocr_config?.provider === 'openai_compatible' && '兼容 API 的密钥',
                      MASK_HINT,
                    ]
                      .filter(Boolean)
                      .join('；')}
                  >
                    <Input
                      id="ocr-key"
                      type="password"
                      autoComplete="off"
                      placeholder="sk-..."
                      value={settings.ocr_config?.key || ''}
                      onChange={(e) => handleOcrChange('key', e.target.value)}
                    />
                  </Field>

                  <Field
                    id="ocr-endpoint"
                    label="API 端点（可选）"
                    hint="留空使用默认端点，自定义端点需填写完整 URL"
                  >
                    <Input
                      id="ocr-endpoint"
                      type="text"
                      placeholder={
                        settings.ocr_config?.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
                        settings.ocr_config?.provider === 'claude' ? 'https://api.anthropic.com/v1/messages' :
                        settings.ocr_config?.provider === 'qwen' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' :
                        settings.ocr_config?.provider === 'siliconflow' ? 'https://api.siliconflow.cn/v1/chat/completions' :
                        'https://your-api-endpoint/v1/chat/completions'
                      }
                      value={settings.ocr_config?.endpoint || ''}
                      onChange={(e) => handleOcrChange('endpoint', e.target.value)}
                    />
                  </Field>

                  <Field id="ocr-model" label="模型名称（可选）" hint="留空使用默认模型">
                    <Input
                      id="ocr-model"
                      type="text"
                      placeholder={
                        settings.ocr_config?.provider === 'openai' ? 'gpt-4o' :
                        settings.ocr_config?.provider === 'claude' ? 'claude-3-5-sonnet-20241022' :
                        settings.ocr_config?.provider === 'qwen' ? 'qwen-vl-plus' :
                        settings.ocr_config?.provider === 'siliconflow' ? 'Qwen/Qwen2-VL-72B-Instruct' :
                        'gpt-4o'
                      }
                      value={settings.ocr_config?.model || ''}
                      onChange={(e) => handleOcrChange('model', e.target.value)}
                    />
                  </Field>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdvancedSettings;
