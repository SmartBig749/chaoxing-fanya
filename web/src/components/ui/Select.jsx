import React from 'react';
import { cn } from '../../lib/utils';

export const SELECT_BASE_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * 下拉选择原语。
 *
 * 支持两种用法：
 *   1. options 数据驱动：<Select options={[{ value, label, disabled }]} />
 *   2. 直接传 <option> 子节点
 */
const Select = React.forwardRef(
  ({ className, options, invalid = false, children, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        SELECT_BASE_CLASS,
        invalid && 'border-destructive focus-visible:ring-destructive',
        className
      )}
      {...props}
    >
      {children
        ?? (options || []).map((opt) => (
          <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
    </select>
  )
);

Select.displayName = 'Select';

export default Select;
