"use client";

import { useConfirmStore, type ConfirmOptions } from "@/app/store/useConfirmStore";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog() {
  const { state, closeConfirm } = useConfirmStore();

  const handleConfirm = () => {
    state.resolve?.(true);
    closeConfirm();
  };

  const handleCancel = () => {
    state.resolve?.(false);
    closeConfirm();
  };

  return (
    <AlertDialog open={state.open} onOpenChange={handleCancel}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="font-bold">{state.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{state.desc ?? ""}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={state.isLoading}>{state.cancelBtnText ?? "Cancel"}</AlertDialogCancel>
          <Button
            variant={state.destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={state.disabled || state.isLoading}
          >
            {state.confirmText ?? "Continue"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function confirm(options: ConfirmOptions) {
  return useConfirmStore.getState().openConfirm(options);
}

export function useConfirm() {
  return useConfirmStore((state) => state.openConfirm);
}
