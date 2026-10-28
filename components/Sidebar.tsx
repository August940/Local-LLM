"use client";

import {
  Compass,
  CreditCard,
  Heart,
  House,
  ImagePlus,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo, LogoMark } from "./Logo";

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/generator", label: "Generator", icon: ImagePlus },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/my-ai", label: "My AI", icon: Heart },
  { href: "/subscription", label: "Subscription", icon: CreditCard },
];

export type SidebarUser = { name: string; plan: string; credits: number } | null;

export function AppShell({ user, children }: { user: SidebarUser; children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("dm-sidebar") === "collapsed");
    } catch {}
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("dm-sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const current = NAV.find((n) => isActive(n.href))?.label ?? (pathname === "/login" ? "Login" : "");

  return (
    <div className="shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <Link href="/" title="dressmaker.ai" style={{ display: "inline-flex" }}>
            {collapsed ? <LogoMark size={26} /> : <Logo />}
          </Link>
          <button
            className="btn btn-icon btn-text"
            style={{ marginLeft: "auto", display: mobileOpen ? "inline-flex" : "none" }}
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="nav-link"
              aria-current={isActive(href) ? "page" : undefined}
              title={collapsed ? label : undefined}
            >
              <Icon strokeWidth={1.6} aria-hidden="true" />
              <span className="nav-label">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user ? (
            <>
              <Link href="/subscription" className="user-card" title={user.name}>
                <span className="avatar" aria-hidden="true">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="user-meta">
                  <strong>{user.name}</strong>
                  <span className="num">
                    {user.plan} · {user.credits} credits
                  </span>
                </span>
              </Link>
              <form action="/auth/signout" method="post">
                <button className="nav-link" title={collapsed ? "Log out" : undefined}>
                  <LogOut strokeWidth={1.6} aria-hidden="true" />
                  <span className="nav-label">Log out</span>
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="nav-link"
              aria-current={pathname === "/login" ? "page" : undefined}
              title={collapsed ? "Login" : undefined}
            >
              <LogIn strokeWidth={1.6} aria-hidden="true" />
              <span className="nav-label">Login</span>
            </Link>
          )}
          <button
            className="sidebar-toggle"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand" : undefined}
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.6} /> : <PanelLeftClose size={16} strokeWidth={1.6} />}
            <span className="nav-label">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="scrim" onClick={() => setMobileOpen(false)} />

      <div className="main">
        <div className="mobile-bar">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <Logo />
          {current && (
            <span className="muted" style={{ marginLeft: "auto", fontSize: 14 }}>
              {current}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
