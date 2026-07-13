"use client";

import {
  forwardRef,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type ImportDialogGateHandle = {
  close: () => void;
  open: () => void;
};

type ImportDialogGateProps = {
  children: ReactNode;
};

export const ImportDialogGate = memo(
  forwardRef<ImportDialogGateHandle, ImportDialogGateProps>(
    function ImportDialogGate({ children }, ref) {
      const [isOpen, setIsOpen] = useState(false);
      const returnFocusRef = useRef<HTMLElement | null>(null);
      const restoreFocusFrameRef = useRef<number | null>(null);
      const open = useCallback(() => {
        returnFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setIsOpen(true);
      }, []);
      const close = useCallback(() => {
        setIsOpen(false);
        if (restoreFocusFrameRef.current !== null) {
          window.cancelAnimationFrame(restoreFocusFrameRef.current);
        }
        restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
          restoreFocusFrameRef.current = null;
          returnFocusRef.current?.focus({ preventScroll: true });
        });
      }, []);

      useImperativeHandle(ref, () => ({ close, open }), [close, open]);

      useEffect(() => {
        if (!isOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const focusFrame = window.requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(
              '[aria-labelledby="import-title"] .dialog-close',
            )
            ?.focus();
        });

        const onKeyDown = (event: KeyboardEvent) => {
          const dialog = document
            .getElementById("import-title")
            ?.closest<HTMLElement>('[role="dialog"]');

          if (event.key === "Tab" && dialog) {
            const focusable = Array.from(
              dialog.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ),
            );
            const first = focusable[0];
            const last = focusable.at(-1);
            if (first && last) {
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
                return;
              }
              if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
                return;
              }
            }
          }

          if (
            event.key !== "Escape" ||
            document.querySelector("[data-photo-gallery-open]")
          ) {
            return;
          }
          event.preventDefault();
          close();
        };

        document.addEventListener("keydown", onKeyDown);
        return () => {
          window.cancelAnimationFrame(focusFrame);
          document.removeEventListener("keydown", onKeyDown);
          document.body.style.overflow = previousOverflow;
        };
      }, [close, isOpen]);

      useEffect(() => {
        return () => {
          if (restoreFocusFrameRef.current !== null) {
            window.cancelAnimationFrame(restoreFocusFrameRef.current);
          }
        };
      }, []);

      return isOpen ? children : null;
    },
  ),
);

ImportDialogGate.displayName = "ImportDialogGate";
