import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * 可访问的复选控件。
 *
 * 真实 <input type="checkbox"> 负责语义与键盘操作（Tab 聚焦、空格切换），
 * 视觉层是装饰元素并标记 aria-hidden，因此读屏不会把勾选图形读成内容。
 * 用 <label> 包住整行，鼠标点击行内任意位置都能切换。
 */
const Checkbox = React.forwardRef(
  ({ id, checked, onChange, disabled = false, className, boxClassName, children, ...props }, ref) => (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-2.5 cursor-pointer select-none',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
          checked ? 'border-primary bg-primary' : 'border-gray-300',
          boxClassName
        )}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </span>
      <span className="flex-1 min-w-0">{children}</span>
    </label>
  )
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
