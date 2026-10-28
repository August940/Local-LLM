"use client";

import {
  ChevronLeft,
  Compass,
  DollarSign,
  Heart,
  House,
  ImagePlus,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/generator", label: "Generator", icon: ImagePlus },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/my-ai", label: "My AI", icon: Heart },
  { href: "/subscription", label: "Subscription", icon: DollarSign },
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

  return (
    <div className="shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      {/* Shared gradient used as stroke for the nav icons */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id="dm-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff1aa1" />
            <stop offset="1" stopColor="#8b29e0" />
          </linearGradient>
        </defs>
      </svg>

      <aside className="sidebar" aria-label="Main navigation">
        <Link href="/" className="sidebar-brand" title="dressmaker.ai">
          <Logo />
        </Link>
        <nav>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="nav-link"
              aria-current={isActive(href) ? "page" : undefined}
              title={collapsed ? label : undefined}
            >
              <Icon strokeWidth={1.8} />
              <span className="nav-label">{label}</span>
            </Link>
          ))}
        </nav>

        <button
          className="sidebar-toggle"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <ChevronLeft size={16} />
        </button>

        <div className="sidebar-footer">
          {user ? (
            <>
              <Link href="/subscription" className="user-card" title={user.name}>
                <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                <span className="user-meta">
                  <strong>{user.name}</strong>
                  <span>
                    {user.plan} · {user.credits} credits
                  </span>
                </span>
              </Link>
              <form action="/auth/signout" method="post">
                <button className="nav-link" style={{ width: "100%", border: 0, background: "none", cursor: "pointer" }}>
                  <LogOut strokeWidth={1.8} />
                  <span className="nav-label">Log out</span>
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="nav-link" aria-current={pathname === "/login" ? "page" : undefined}>
              <LogIn strokeWidth={1.8} />
              <span className="nav-label">Login</span>
            </Link>
          )}
        </div>
      </aside>

      <div className="scrim" onClick={() => setMobileOpen(false)} />

      <div className="main">
        <div className="mobile-bar">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
