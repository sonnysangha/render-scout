"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Opening the room…" : "Write my script"}
      <span aria-hidden="true">→</span>
    </button>
  );
}
