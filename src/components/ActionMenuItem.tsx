import type { ButtonHTMLAttributes } from 'react';

export function ActionMenuItem({
  menuId,
  role = 'menuitem',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { menuId: string }) {
  return <button {...props} role={role} data-menu-id={menuId} />;
}
