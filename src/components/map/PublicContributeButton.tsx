"use client";

import { useState } from "react";
import PublicSubmissionForm from "./PublicSubmissionForm";

interface PublicContributeButtonProps {
  orgId: string;
}

export default function PublicContributeButton({
  orgId,
}: PublicContributeButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function handleSuccess(status: string) {
    setShowForm(false);

    const message =
      status === "approved"
        ? "Photo submitted and published — thank you!"
        : "Photo submitted for review — thank you!";

    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <>
      {/* Floating action button — fixed bottom-right, z-[500] */}
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-4 z-[500] flex items-center gap-2 bg-forest hover:bg-forest-dark text-white rounded-full px-4 py-3 shadow-lg transition-colors font-medium text-sm"
        aria-label="Submit a photo"
      >
        {/* Camera icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span>Submit a Photo</span>
      </button>

      {/* Submission modal */}
      {showForm && (
        <PublicSubmissionForm
          orgId={orgId}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {/* Success toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[1100] bg-forest text-white text-sm rounded-full px-5 py-2.5 shadow-lg pointer-events-none animate-fade-in"
        >
          {toast}
        </div>
      )}
    </>
  );
}
