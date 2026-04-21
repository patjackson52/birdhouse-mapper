import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/app/api/public-contribute/actions', () => ({
  submitPublicContribution: vi.fn().mockResolvedValue({ success: true, status: 'approved' }),
}));

import PublicSubmissionForm from '../PublicSubmissionForm';

// Polyfill FileReader.readAsDataURL for jsdom — the real form base64-encodes
// the selected file. We return a stable data URL so the submit handler
// completes synchronously-ish.
class MockFileReader {
  public result: string | ArrayBuffer | null = null;
  public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
  public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
  readAsDataURL(_blob: Blob) {
    this.result = 'data:image/png;base64,AAAA';
    // Fire onload on the next microtask so callers can await.
    queueMicrotask(() => {
      if (this.onload) this.onload.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
    });
  }
}
(globalThis as unknown as { FileReader: typeof FileReader }).FileReader =
  MockFileReader as unknown as typeof FileReader;

// URL.createObjectURL isn't implemented in jsdom.
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:mock';
}

describe('PublicSubmissionForm', () => {
  it('renders the optional Name input with maxLength=80', () => {
    render(
      <PublicSubmissionForm orgId="org-1" onClose={() => {}} onSuccess={() => {}} />
    );

    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    expect(nameInput).toBeDefined();
    expect(nameInput.maxLength).toBe(80);
    expect(nameInput.value).toBe('');
  });

  it('updates the Name input value on change', () => {
    render(
      <PublicSubmissionForm orgId="org-1" onClose={() => {}} onSuccess={() => {}} />
    );

    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'BirdFan' } });
    expect(nameInput.value).toBe('BirdFan');
  });

  it('includes trimmed anonName in the submission payload', async () => {
    const mod = await import('@/app/api/public-contribute/actions');
    const submitMock = mod.submitPublicContribution as unknown as ReturnType<typeof vi.fn>;
    submitMock.mockClear();

    render(
      <PublicSubmissionForm orgId="org-1" onClose={() => {}} onSuccess={() => {}} />
    );

    // Attach a required file via the hidden file input.
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // Fill the Name with whitespace-padded value to exercise trimming.
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '  BirdFan  ' } });

    // Submit.
    fireEvent.click(screen.getByRole('button', { name: /submit photo/i }));

    await waitFor(() => {
      expect(submitMock).toHaveBeenCalled();
    });
    const args = submitMock.mock.calls[0][0];
    expect(args.anonName).toBe('BirdFan');
  });

  it('passes anonName as null when Name is empty', async () => {
    const mod = await import('@/app/api/public-contribute/actions');
    const submitMock = mod.submitPublicContribution as unknown as ReturnType<typeof vi.fn>;
    submitMock.mockClear();

    render(
      <PublicSubmissionForm orgId="org-1" onClose={() => {}} onSuccess={() => {}} />
    );

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // Leave Name empty.
    fireEvent.click(screen.getByRole('button', { name: /submit photo/i }));

    await waitFor(() => {
      expect(submitMock).toHaveBeenCalled();
    });
    const args = submitMock.mock.calls[0][0];
    expect(args.anonName).toBeNull();
  });
});
