import { useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

const STORAGE_KEY = 'sidebar-collapsed';

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1',
  );
  const { pathname } = useLocation();

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return (
    <div className={`main-layout${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main className="content-area">
        {/* key 换掉就重新挂载，切页时才会重放进场动画。
            .anim-page 的 fill-mode 是 backwards，动画结束后不会
            残留 transform/filter，页面里的固定定位抽屉不受影响。 */}
        <div className="anim-page" key={pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
