"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Info, Loader2, Lock, Mail, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import {
  updateProfileAction,
  uploadAvatarAction,
} from "@/features/auth/actions";
import { compressProfileImage } from "@/features/dashboard/compress-profile-image";
import { SkeuButton } from "@/components/ui/skeu-button";
import { SkeuInput } from "@/components/ui/skeu-input";
import {
  getUserRoleDescription,
  getUserRoleLabel,
} from "@/lib/user-role-label";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/server/db/schema/enums";

export type ProfileUser = {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  imageUrl: string | null;
};

export type ProfileSaveResult = {
  name: string;
  firstName: string;
  lastName: string;
};

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

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function UserProfileModal({
  open,
  user,
  onClose,
  onAvatarChange,
  onProfileSave,
}: {
  open: boolean;
  user: ProfileUser;
  onClose: () => void;
  onAvatarChange?: (imageUrl: string) => void;
  onProfileSave?: (profile: ProfileSaveResult) => void;
}) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isClient = useIsClient();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [imageUrl, setImageUrl] = useState<string | null>(user.imageUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
  }>({});

  const busy = uploading || saving;
  const displayName = `${firstName} ${lastName}`.trim() || user.name;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, busy]);

  async function handleAvatarSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressProfileImage(file);
      const result = await uploadAvatarAction(compressed);
      if (result.error || !result.imageUrl) {
        toast.error(result.error ?? "No se pudo actualizar la foto.");
        return;
      }

      setImageUrl(result.imageUrl);
      onAvatarChange?.(result.imageUrl);
      toast.success("Foto de perfil actualizada.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la foto.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setSaving(true);

    try {
      const result = await updateProfileAction({ firstName, lastName });
      if (result.error || !result.name || !result.firstName || !result.lastName) {
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        toast.error(result.error ?? "No se pudo guardar el perfil.");
        return;
      }

      onProfileSave?.({
        name: result.name,
        firstName: result.firstName,
        lastName: result.lastName,
      });
      toast.success("Perfil actualizado.");
      router.refresh();
      onClose();
    } catch {
      toast.error("No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !isClient) {
    return null;
  }

  const initials = getInitials(displayName);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Cerrar perfil"
        className="absolute inset-0 bg-text-primary/25"
        disabled={busy}
        onClick={() => {
          if (!busy) {
            onClose();
          }
        }}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="relative z-[201] w-full max-w-[750px] overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-md"
      >
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <div className="flex items-center gap-2">
            <UserRound className="size-5 text-accent" aria-hidden />
            <h2
              id={titleId}
              className="text-sm font-bold tracking-wide text-accent uppercase"
            >
              Perfil
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-pressed hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-8 p-6 sm:p-8 md:flex-row">
          <div className="w-full md:w-[35%]">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                void handleAvatarSelected(event);
              }}
            />
            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  "relative flex aspect-square w-full items-center justify-center overflow-hidden",
                  "rounded-xl border border-surface-border bg-accent-mint",
                )}
              >
                {imageUrl ? (
                  // Data-URL avatars are stored in Neon; next/image is not suitable here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={`Foto de ${displayName}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="text-5xl font-black text-accent/80">
                    {initials}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "text-xs font-bold text-accent-dark uppercase transition-colors",
                  "hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  "disabled:cursor-wait disabled:opacity-70",
                )}
              >
                {uploading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Subiendo…
                  </span>
                ) : (
                  "Cambiar foto"
                )}
              </button>
            </div>
            <p className="mt-3 text-center text-xs leading-relaxed text-text-secondary">
              Sube una foto clara (JPG, PNG o WebP) para que tus colaboradores
              puedan identificarte fácilmente en los reportes de licitación.
            </p>
          </div>

          <div className="w-full space-y-6 md:w-[65%]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="profile-first-name"
                  className="text-xs font-bold tracking-tight text-text-secondary uppercase"
                >
                  Nombres
                </label>
                <SkeuInput
                  id="profile-first-name"
                  name="firstName"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    if (fieldErrors.firstName) {
                      setFieldErrors((current) => ({
                        ...current,
                        firstName: undefined,
                      }));
                    }
                  }}
                  autoComplete="given-name"
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.firstName)}
                  required
                />
                {fieldErrors.firstName ? (
                  <p className="text-xs text-danger" role="alert">
                    {fieldErrors.firstName}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="profile-last-name"
                  className="text-xs font-bold tracking-tight text-text-secondary uppercase"
                >
                  Apellidos
                </label>
                <SkeuInput
                  id="profile-last-name"
                  name="lastName"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    if (fieldErrors.lastName) {
                      setFieldErrors((current) => ({
                        ...current,
                        lastName: undefined,
                      }));
                    }
                  }}
                  autoComplete="family-name"
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.lastName)}
                  required
                />
                {fieldErrors.lastName ? (
                  <p className="text-xs text-danger" role="alert">
                    {fieldErrors.lastName}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-bold tracking-tight text-text-secondary uppercase">
                Correo electrónico
              </p>
              <div className="flex items-center gap-3 rounded-md border border-surface-border/80 bg-surface-base px-4 py-3">
                <Mail className="size-4 shrink-0 text-text-secondary" aria-hidden />
                <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                  {user.email}
                </span>
                <Lock
                  className="ml-auto size-3.5 shrink-0 text-text-secondary/60"
                  aria-hidden
                />
              </div>
              <p className="text-[10px] text-text-secondary italic">
                El correo institucional no puede ser modificado por el usuario.
              </p>
            </div>

            <div className="flex gap-3 rounded-r-md border-l-4 border-accent-peach bg-accent-peach/15 p-4">
              <Info
                className="mt-0.5 size-4 shrink-0 text-accent-coral"
                aria-hidden
              />
              <div className="space-y-1">
                <p className="text-xs font-bold text-text-primary">
                  Rol de acceso
                </p>
                <p className="text-[11px] leading-relaxed text-text-secondary">
                  {getUserRoleDescription(user.role)}
                </p>
                <p className="sr-only">{getUserRoleLabel(user.role)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-surface-border bg-surface-base px-6 py-5 sm:px-8">
          <SkeuButton
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </SkeuButton>
          <SkeuButton type="submit" variant="primary" disabled={busy}>
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Guardando…
              </span>
            ) : (
              "Guardar cambios"
            )}
          </SkeuButton>
        </div>
      </form>
    </div>,
    document.body,
  );
}
