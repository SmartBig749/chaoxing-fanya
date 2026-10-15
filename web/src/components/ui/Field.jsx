import React from 'react';
import { cn } from '../../lib/utils';
import Label from './Label';

/**
 * 表单字段容器：统一「标签 + 控件 + 帮助文案 / 错误文案」的结构与间距。
 *
 * 错误文案带 role="alert"，读屏会在出现时自动播报；
 * 错误存在时优先显示错误，避免与帮助文案同时占用空间。
 */
const Field = ({ id, label, hint, error, required = false, className, children }) => (
  <div className={cn('space-y-2', className)}>
    {label && (
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive ml-1" aria-hidden="true">
            *
          </span>
        )}
      </Label>
    )}
    {children}
    {error ? (
      <p id={id ? `${id}-error` : undefined} role="alert" className="text-xs text-destructive">
        {error}
      </p>
    ) : hint ? (
      <p id={id ? `${id}-hint` : undefined} className="text-xs text-muted-foreground">
        {hint}
      </p>
    ) : null}
  </div>
);

export default Field;
