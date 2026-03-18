import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import PageContainer from "../components/PageContainer";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/calibration", label: "Calibration" },
  { to: "/control", label: "Eye Control" },
  { to: "/accuracy", label: "Accuracy Test" },
];

function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const wheelLockRef = useRef(false);

  useEffect(() => {
    const onWheel = (event) => {
      if (wheelLockRef.current) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, button, [role='slider']")
      ) {
        return;
      }

      const direction = event.deltaY > 30 ? 1 : event.deltaY < -30 ? -1 : 0;
      if (!direction) {
        return;
      }

      const currentIndex = navItems.findIndex(
        (item) => item.to === location.pathname
      );
      if (currentIndex === -1) {
        return;
      }

      const nextIndex = Math.max(
        0,
        Math.min(navItems.length - 1, currentIndex + direction)
      );
      if (nextIndex === currentIndex) {
        return;
      }

      wheelLockRef.current = true;
      document.body.classList.add("route-scroll-transitioning");
      document.body.classList.toggle("route-scroll-down", direction > 0);
      document.body.classList.toggle("route-scroll-up", direction < 0);

      window.setTimeout(() => {
        navigate(navItems[nextIndex].to);
      }, 220);

      window.setTimeout(() => {
        wheelLockRef.current = false;
        document.body.classList.remove(
          "route-scroll-transitioning",
          "route-scroll-down",
          "route-scroll-up"
        );
      }, 760);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      document.body.classList.remove(
        "route-scroll-transitioning",
        "route-scroll-down",
        "route-scroll-up"
      );
    };
  }, [location.pathname, navigate]);

  return (
    <PageContainer>
      <header className="app-topbar-wrap">
        <div className="hero-ui-topbar">
          <p className="hero-ui-brand">GAZEASSIST</p>
          <nav className="hero-ui-nav-pill" aria-label="Main Navigation">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`hero-ui-nav-item ${isActive ? "is-active" : ""}`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="hero-ui-nav-active-bg"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="w-full flex-1 max-w-none px-0 pb-0 pt-0">
        <div className="app-content-offset">
          <Outlet />
        </div>
      </main>
    </PageContainer>
  );
}

export default MainLayout;
