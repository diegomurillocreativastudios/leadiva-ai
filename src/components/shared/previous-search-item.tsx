"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DeleteSearchConfirmModal } from "@/features/dashboard/delete-search-confirm-modal";
import {
  deleteSearchExecutionAction,
  renameSearchExecutionAction,
} from "@/features/dashboard/search-history-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { homeSearchHref } from "@/lib/home-search-href";
import { cn } from "@/lib/utils";

export type PreviousSearchLink = {
  id: string;
  label: string;
};

export function PreviousSearchItem({
  item,
  selected,
  onNavigate,
}: {
  item: PreviousSearchLink;
  selected: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.label);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!renaming) {
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  function startRename() {
    setDraftTitle(item.label);
    setRenaming(true);
    setMenuOpen(false);
  }

  function cancelRename() {
    setRenaming(false);
    setDraftTitle(item.label);
  }

  function submitRename(event?: FormEvent) {
    event?.preventDefault();
    const title = draftTitle.trim();
    if (title.length < 1) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
    if (title === item.label) {
      setRenaming(false);
      return;
    }

    startTransition(async () => {
      const result = await renameSearchExecutionAction({
        executionId: item.id,
        title,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Nombre actualizado");
      setRenaming(false);
      router.refresh();
    });
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  }

  function openDeleteConfirm(event: Event) {
    event.preventDefault();
    setMenuOpen(false);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteSearchExecutionAction({
        executionId: item.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Búsqueda eliminada");
      setDeleteOpen(false);
      if (selected) {
        router.push("/");
      }
      router.refresh();
    });
  }

  function stopLinkNavigation(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (renaming) {
    return (
      <li className="w-full">
        <form
          onSubmit={submitRename}
          className={cn(
            "flex w-full items-center gap-2 border-l-2 px-3 py-2",
            selected
              ? "border-l-accent bg-accent-mint/50"
              : "border-l-transparent",
          )}
        >
          <label htmlFor={inputId} className="sr-only">
            Nuevo nombre de la búsqueda
          </label>
          <input
            ref={inputRef}
            id={inputId}
            value={draftTitle}
            disabled={pending}
            maxLength={160}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={onRenameKeyDown}
            onBlur={() => {
              if (pending) {
                return;
              }
              const title = draftTitle.trim();
              if (!title || title === item.label) {
                cancelRename();
                return;
              }
              void submitRename();
            }}
            className="min-w-0 flex-1 rounded-md border border-accent/40 bg-surface-raised px-1.5 py-0.5 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
          />
        </form>
      </li>
    );
  }

  return (
    <li className="group/search-item relative w-full">
      <div
        className={cn(
          "flex w-full items-center gap-1 border-l-2 py-2 pl-3 pr-1 transition-colors",
          selected
            ? "border-l-accent bg-accent-mint/50 text-accent"
            : "border-l-transparent text-text-secondary hover:bg-surface-pressed hover:text-accent",
          menuOpen && !selected && "bg-surface-pressed text-accent",
        )}
      >
        <Link
          href={homeSearchHref(item.id)}
          prefetch={false}
          onClick={onNavigate}
          aria-current={selected ? "page" : undefined}
          className="min-w-0 flex-1 truncate text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {item.label}
        </Link>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={pending}
              aria-label={`Opciones de búsqueda: ${item.label}`}
              onClick={stopLinkNavigation}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md text-text-secondary",
                "opacity-0 transition-opacity group-hover/search-item:opacity-100 group-focus-within/search-item:opacity-100 focus-visible:opacity-100",
                "hover:bg-surface-pressed hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                "data-[state=open]:opacity-100",
                menuOpen && "opacity-100",
                selected && "text-accent hover:bg-accent-mint",
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            sideOffset={8}
            className="min-w-44 rounded-xl border border-surface-border bg-surface-raised p-1.5 shadow-md"
          >
            <DropdownMenuItem
              className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-primary focus:bg-accent-mint focus:text-text-primary"
              onSelect={(event) => {
                event.preventDefault();
                startRename();
              }}
            >
              <Pencil className="size-4 text-text-secondary" aria-hidden />
              Cambiar nombre
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-danger/10"
              disabled={pending}
              onSelect={openDeleteConfirm}
            >
              <Trash2 className="size-4" aria-hidden />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DeleteSearchConfirmModal
        open={deleteOpen}
        searchLabel={item.label}
        pending={pending}
        onClose={() => {
          if (!pending) {
            setDeleteOpen(false);
          }
        }}
        onConfirm={confirmDelete}
      />
    </li>
  );
}
