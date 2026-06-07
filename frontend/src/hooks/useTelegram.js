import { useState } from 'react';

const tg = typeof window !== 'undefined' && window?.Telegram?.WebApp ? window.Telegram.WebApp : null;

export function useTelegram() {
  const [isReady] = useState(() => {
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (e) {
        console.error("Telegram SDK ready failed:", e);
      }
    }
    return true;
  });

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
    try {
      tg.enableClosingConfirmation();
    } catch (err) {
      // Telegram SDK might not be available in non-Telegram environments
      console.debug("Telegram closing confirmation not supported", err);
    }
  };

  return {
    onClose,
    onToggleButton,
    enableClosingConfirmation,
    tg,
    isReady,
    user: tg?.initDataUnsafe?.user || { id: 'dev_user', first_name: 'Dev' },
    queryId: tg?.initDataUnsafe?.query_id,
  };
}
