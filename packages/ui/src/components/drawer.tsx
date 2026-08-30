"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../lib/cn";
import { spring } from "../lib/motion";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

// Mirrors Figma "Drawer": 420px right panel, Elevation/3, header/body/footer, spring 420/32.
export function Drawer({ open, onOpenChange, title, children, footer, className }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-40 bg-neutral-950/60 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                className={cn("fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col rounded-l-2xl border-l border-border bg-surface-raised shadow-3 outline-none", className)}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={spring}
              >
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <Dialog.Title className="font-display text-xl font-semibold">{title}</Dialog.Title>
                  <Dialog.Close className="rounded-md p-1 text-muted hover:bg-surface-overlay hover:text-foreground" aria-label="Close">
                    <X size={18} />
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {footer && <div className="flex gap-3 border-t border-border px-6 py-4 [&>*]:flex-1">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
