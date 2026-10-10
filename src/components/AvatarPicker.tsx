import { useEffect, useRef, useState } from 'react';
import { compressAvatar } from '../lib/upload';
import { Avatar } from './Avatar';
import { CameraSheet, prefersInAppCamera } from './CameraSheet';
import './AvatarPicker.css';

export type AvatarChoice =
  | { kind: 'url'; url: string | null }
  /** A cropped 256px JPEG that has not been uploaded yet. */
  | { kind: 'custom'; blob: Blob; preview: string };

export interface AvatarPreset {
  label: string;
  url: string | null;
}

export interface AvatarPickerProps {
  name: string;
  value: AvatarChoice;
  onChange(next: AvatarChoice): void;
  /** Buttons that select an existing photo URL ("Use Google photo", "Keep current"). */
  presets: AvatarPreset[];
  onError?(message: string): void;
}

export function AvatarPicker({ name, value, onChange, presets, onError }: AvatarPickerProps) {
  const selfieRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [camera, setCamera] = useState(false);
  const previewRef = useRef<string | null>(null);

  // Free the object URL of a custom preview when it is replaced or the picker unmounts.
  useEffect(() => {
    const current = value.kind === 'custom' ? value.preview : null;
    if (previewRef.current && previewRef.current !== current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = current;
  }, [value]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const pick = async (file: Blob | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      const blob = await compressAvatar(file);
      onChange({ kind: 'custom', blob, preview: URL.createObjectURL(blob) });
    } catch {
      onError?.("That photo couldn't be read. Try another one.");
    } finally {
      setProcessing(false);
    }
  };

  const shownUrl = value.kind === 'custom' ? value.preview : value.url;

  return (
    <div className="avatar-picker">
      <Avatar name={name || '?'} src={shownUrl} size={92} />
      <div className="avatar-picker__options">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="avatar-picker__btn"
            aria-pressed={value.kind === 'url' && value.url === preset.url}
            onClick={() => onChange({ kind: 'url', url: preset.url })}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="avatar-picker__btn"
          aria-pressed={false}
          disabled={processing}
          onClick={() => (prefersInAppCamera() ? setCamera(true) : selfieRef.current?.click())}
        >
          Take a selfie
        </button>
        <button
          type="button"
          className="avatar-picker__btn"
          aria-pressed={value.kind === 'custom'}
          disabled={processing}
          onClick={() => fileRef.current?.click()}
        >
          {processing ? 'Preparing…' : 'Choose a photo'}
        </button>
      </div>
      <input
        ref={selfieRef}
        type="file"
        accept="image/*"
        capture="user"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        aria-label="Take a selfie"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        aria-label="Choose a photo"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {camera ? (
        <CameraSheet
          title="Take a selfie"
          facing="user"
          onClose={() => setCamera(false)}
          onCapture={(photo) => {
            setCamera(false);
            void pick(photo);
          }}
          onUseFile={() => {
            setCamera(false);
            fileRef.current?.click();
          }}
        />
      ) : null}
    </div>
  );
}
