"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronUp,
  LogOut,
  Menu,
  MessageSquarePlus,
  Settings,
  UserRound,
  X,
} from "lucide-react";

import { logoutAction } from "@/features/auth/actions";
import { SettingsComingSoonModal } from "@/features/dashboard/settings-coming-soon-modal";
import {
  UserProfileModal,
  type ProfileUser,
} from "@/features/dashboard/user-profile-modal";
import { LeadivaBrand } from "@/components/shared/leadiva-logo";
import {
  PreviousSearchItem,
  type PreviousSearchLink,
} from "@/components/shared/previous-search-item";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FOCUS_HOME_SEARCH_FLAG,
  NEW_HOME_SEARCH_EVENT,
} from "@/lib/home-greetings";
import { getUserRoleLabel } from "@/lib/user-role-label";
import { cn } from "@/lib/utils";

export type { PreviousSearchLink };

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "U";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function PreviousSearches({
  items,
  selectedExecutionId,
  onNavigate,
}: {
  items: PreviousSearchLink[];
  selectedExecutionId?: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-1">
      <p className="mb-3 shrink-0 px-4 text-[11px] font-bold tracking-wider text-text-secondary uppercase">
        Búsquedas anteriores
      </p>
      {items.length === 0 ? (
        <p className="px-4 text-sm leading-snug text-text-secondary">
          Aún no hay búsquedas. Empieza con una pregunta a Leadiva AI.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pb-4">
          {items.map((item) => (
            <PreviousSearchItem
              key={item.id}
              item={item}
              selected={item.id === selectedExecutionId}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileFooter({ user }: { user: ProfileUser }) {
  const roleLabel = getUserRoleLabel(user.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(user.imageUrl);
  const [serverImageUrl, setServerImageUrl] = useState(user.imageUrl);
  const [profile, setProfile] = useState({
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  const [serverProfileKey, setServerProfileKey] = useState(
    `${user.name}|${user.firstName}|${user.lastName}`,
  );

  if (user.imageUrl !== serverImageUrl) {
    setServerImageUrl(user.imageUrl);
    setImageUrl(user.imageUrl);
  }

  const nextProfileKey = `${user.name}|${user.firstName}|${user.lastName}`;
  if (nextProfileKey !== serverProfileKey) {
    setServerProfileKey(nextProfileKey);
    setProfile({
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  const initials = getInitials(profile.name);

  return (
    <>
      <div className="shrink-0 px-4 pt-3 pb-1">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg bg-accent-mint px-3 py-3 text-left",
                "border border-accent/20 transition-colors",
                "hover:bg-accent-mint/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                menuOpen && "bg-accent-mint",
              )}
              aria-label="Menú de perfil"
            >
              <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-accent bg-surface-raised text-sm font-bold text-accent shadow-sm">
                {imageUrl ? (
                  // Data-URL avatars are stored in Neon; next/image is not suitable here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  initials
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-accent">
                  {profile.name}
                </span>
                <span className="block truncate text-[10px] text-text-secondary">
                  {roleLabel}
                </span>
              </span>
              <ChevronUp
                className={cn(
                  "size-4 shrink-0 text-accent transition-transform",
                  !menuOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 overflow-hidden rounded-lg border border-surface-border bg-surface-raised p-0 shadow-md"
          >
            <DropdownMenuItem
              className="cursor-pointer gap-3 rounded-none px-4 py-3.5 text-sm font-medium text-text-secondary focus:bg-accent-mint focus:text-text-secondary"
              onSelect={() => {
                setProfileOpen(true);
              }}
            >
              <UserRound className="size-4 text-accent" aria-hidden />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-0 my-0" />
            <DropdownMenuItem
              className="cursor-pointer gap-3 rounded-none px-4 py-3.5 text-sm font-medium text-text-secondary focus:bg-accent-mint focus:text-text-secondary"
              onSelect={() => {
                setSettingsOpen(true);
              }}
            >
              <Settings className="size-4 text-accent" aria-hidden />
              Configuración
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-0 my-0" />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer gap-3 rounded-none px-4 py-3.5 text-sm font-medium text-danger focus:bg-danger/10 focus:text-danger"
              onSelect={() => {
                void logoutAction();
              }}
            >
              <LogOut className="size-4 text-danger" aria-hidden />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {profileOpen ? (
        <UserProfileModal
          key={`${user.email}-${profile.name}`}
          open
          user={{
            ...user,
            ...profile,
            imageUrl,
          }}
          onClose={() => setProfileOpen(false)}
          onAvatarChange={setImageUrl}
          onProfileSave={setProfile}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsComingSoonModal
          open
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}

function SidebarBody({
  user,
  previousSearches,
  selectedExecutionId,
  onNavigate,
}: {
  user: ProfileUser;
  previousSearches: PreviousSearchLink[];
  selectedExecutionId?: string | null;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="shrink-0 px-4 pb-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <LeadivaBrand size="sm" />
        </Link>
      </div>
      <div className="shrink-0 border-t border-surface-border px-4 pt-4 pb-3">
        <Link
          href="/"
          onClick={() => {
            sessionStorage.setItem(FOCUS_HOME_SEARCH_FLAG, "1");
            window.dispatchEvent(new Event(NEW_HOME_SEARCH_EVENT));
            onNavigate?.();
          }}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-3 py-2.5",
            "text-sm font-medium text-text-primary transition-colors",
            "hover:border-accent/40 hover:bg-accent-mint/40 hover:text-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          )}
        >
          <MessageSquarePlus className="size-4 shrink-0" aria-hidden />
          Nueva búsqueda
        </Link>
      </div>
      <PreviousSearches
        items={previousSearches}
        selectedExecutionId={selectedExecutionId}
        onNavigate={onNavigate}
      />
      <ProfileFooter user={user} />
    </>
  );
}

export function HomeSidebar({
  user,
  previousSearches,
  selectedExecutionId = null,
}: {
  user: ProfileUser;
  previousSearches: PreviousSearchLink[];
  selectedExecutionId?: string | null;
}) {
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
        <LeadivaBrand size="sm" />
        <SkeuButton
          type="button"
          variant="default"
          size="icon-sm"
          aria-expanded={open}
          aria-controls="home-sidebar"
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
        id="home-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden bg-surface-raised pt-6 pb-3",
          "border-r border-surface-border shadow-md",
          "transition-transform duration-200 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarBody
          user={user}
          previousSearches={previousSearches}
          selectedExecutionId={selectedExecutionId}
          onNavigate={() => setOpen(false)}
        />
      </aside>

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-surface-border bg-surface-raised pt-6 pb-3 md:flex">
        <SidebarBody
          user={user}
          previousSearches={previousSearches}
          selectedExecutionId={selectedExecutionId}
        />
      </aside>
    </>
  );
}
