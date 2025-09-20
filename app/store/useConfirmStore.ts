import type { ReactNode } from "react";
import { create } from "zustand";

export type ConfirmOptions = {
  title: ReactNode;
  desc?: ReactNode;
  confirmText?: ReactNode;
  cancelBtnText?: ReactNode;
  destructive?: boolean;
  className?: string;
  isLoading?: boolean;
  disabled?: boolean;
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve?: (v: boolean) => void;
};

type ConfirmStore = {
  state: ConfirmState;
  openConfirm: (options: ConfirmOptions) => Promise<boolean>;
  closeConfirm: () => void;
};

export const useConfirmStore = create<ConfirmStore>((set) => ({
  state: {
    open: false,
    title: "",
    desc: ""
  },
  openConfirm: (options) =>
    new Promise((resolve) => {
      set({
        state: {
          ...options,
          open: true,
          resolve
        }
      });
    }),
  closeConfirm: () => {
    set((s) => ({
      state: { ...s.state, open: false }
    }));
  }
}));
