import { useState, useEffect } from 'react';

const tg = window?.Telegram?.WebApp;

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (tg) {
      // Signal to the Telegram native client that the Mini App is ready.
      // On mobile, networking (especially WebSocket upgrades) may be silently
      // blocked until this handshake completes with the native bridge.
      tg.ready();
      tg.expand();
      setIsReady(true);
    } else {
      // Running outside Telegram (e.g. direct browser access for dev)
      setIsReady(true);
    }
  }, []);

  const onClose = () => {
    tg?.close();
  };

  const onToggleButton = () => {
    if (tg?.MainButton?.isVisible) {
      tg.MainButton.hide();
    } else {
      tg?.MainButton?.show();
    }
  };

  const enableClosingConfirmation = () => {
    tg?.enableClosingConfirmation();
  };

  return {
    onClose,
    onToggleButton,
    enableClosingConfirmation,
    tg,
    isReady,
    user: tg?.initDataUnsafe?.user,
    queryId: tg?.initDataUnsafe?.query_id,
  };
}
