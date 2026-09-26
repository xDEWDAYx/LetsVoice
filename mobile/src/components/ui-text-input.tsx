import { type ComponentProps } from "react";
import { TextInput as NativeTextInput } from "react-native";

import { useAppPreferences } from "@/providers/app-preferences-provider";
import { textSizeScale } from "@/services/app-preferences-service";
import { scaleTextStyle } from "@/utils/scale-text-style";

type Props = ComponentProps<typeof NativeTextInput>;

export function UiTextInput({ placeholder, ...props }: Props) {
  const { textSize } = useAppPreferences();
  const scaledStyle = scaleTextStyle(props.style, textSizeScale(textSize));
  return (
    <NativeTextInput
      allowFontScaling
      {...props}
      placeholder={placeholder}
      style={[props.style, scaledStyle]}
    />
  );
}
