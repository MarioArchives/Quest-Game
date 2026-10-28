// The pack's layer over the app (PackLook.layer): the torch tour's host. It stays tiny until a run starts (tourState's
// startTour), then loads the heavy TourFrame and shows it. If the frame can't load, or breaks, a toast says so and the
// app is left as it was: lit, and not inert.
import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useToast } from '../../../components/Toast';
import type { PackLayerProps } from '../../types';
import type { TourFrameProps } from './TourFrame';
import { closeTour, loadFrame, useTourRequest } from './tourState';

const FAILED = 'The tour didn’t load. Check your connection, then try again from My file.';

export default function TourHost({ setCovering }: PackLayerProps) {
  const request = useTourRequest();
  const toast = useToast();
  const [Frame, setFrame] = useState<ComponentType<TourFrameProps> | null>(null);

  useEffect(() => {
    if (!request || Frame) return;
    let live = true;
    loadFrame().then(
      (m) => live && setFrame(() => m.default),
      () => {
        if (!live) return;
        toast(FAILED, 'error');
        closeTour();
      },
    );
    return () => {
      live = false;
    };
  }, [request, Frame, toast]);

  if (!request || !Frame) return null;
  return (
    <Guard
      key={request.id}
      onError={() => {
        toast(FAILED, 'error');
        closeTour();
      }}
    >
      <Frame request={request} setCovering={setCovering} />
    </Guard>
  );
}

/** A frame that throws is dropped (its cleanup takes the cover off) rather than taking the app down with it. */
class Guard extends Component<{ onError(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
