"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FolderKanban,
  Home,
  Menu,
  Settings,
  Target,
  X,
} from "lucide-react";

import { logoutAction } from "@/features/auth/actions";
import { LeadivaBrand } from "@/components/shared/leadiva-logo";
import { SkeuButton } from "@/components/ui/skeu-button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/projects", label: "Oportunidades", icon: FolderKanban },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/activity", label: "Actividad", icon: Activity },
  { href: "/settings", label: "Configuración", icon: Settings },
] as const;

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
      {links.map((link) => {
        const Icon = link.icon;
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium",
              "border-l-2 border-transparent transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              active
                ? "border-l-accent bg-accent-mint text-accent"
                : "text-text-secondary hover:bg-surface-pressed hover:text-text-primary",
            )}
          >
            <Icon
              className={cn("size-4", active ? "text-accent" : undefined)}
              aria-hidden
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({
  userName,
  pathname,
  onNavigate,
}: {
  userName: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="mb-8 space-y-1">
        <LeadivaBrand size="sm" />
        <p className="truncate pl-[38px] text-xs text-text-secondary">{userName}</p>
      </div>
      <NavLinks pathname={pathname} onNavigate={onNavigate} />
      <form action={logoutAction} className="mt-4">
        <SkeuButton
          variant="ghost"
          size="sm"
          type="submit"
          className="w-full justify-start"
        >
          Cerrar sesión
        </SkeuButton>
      </form>
    </>
  );
}

export function AppSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-4 py-3 md:hidden">
        <div className="min-w-0">
          <LeadivaBrand size="sm" />
          <p className="truncate pl-[38px] text-xs text-text-secondary">{userName}</p>
        </div>
        <SkeuButton
          type="button"
          variant="default"
          size="icon-sm"
          aria-expanded={open}
          aria-controls="mobile-sidebar"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X /> : <Menu />}
        </SkeuButton>
      </div>

      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-text-primary/25 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id="mobile-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col p-4",
          "border-r border-surface-border bg-surface-raised shadow-md",
          "transition-transform duration-200 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarBody
          userName={userName}
          pathname={pathname}
          onNavigate={() => setOpen(false)}
        />
      </aside>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-surface-border bg-surface-raised p-4 md:flex">
        <SidebarBody userName={userName} pathname={pathname} />
      </aside>
    </>
  );
}
