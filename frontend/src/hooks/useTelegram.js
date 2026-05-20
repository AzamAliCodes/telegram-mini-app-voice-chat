const tg = window?.Telegram?.WebApp;

export function useTelegram() {
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
    user: tg?.initDataUnsafe?.user,
    queryId: tg?.initDataUnsafe?.query_id,
  };
}
