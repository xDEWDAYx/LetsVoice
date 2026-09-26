import { Alert as NativeAlert, type AlertButton, type AlertOptions } from "react-native";

function tr(value: string | undefined): string | undefined {
  return value;
}

export const UiAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    NativeAlert.alert(
      tr(title) ?? title,
      tr(message),
      buttons?.map((button) => ({ ...button, text: tr(button.text) })),
      options,
    );
  },
  prompt: NativeAlert.prompt.bind(NativeAlert),
};
