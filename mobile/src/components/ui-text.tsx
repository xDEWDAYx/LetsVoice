import { type ComponentProps } from "react";
import { Text as NativeText } from "react-native";

import { useAppPreferences } from "@/providers/app-preferences-provider";
import { textSizeScale } from "@/services/app-preferences-service";
import { scaleTextStyle } from "@/utils/scale-text-style";

type Props = ComponentProps<typeof NativeText>;

export function UiText({ children, ...props }: Props) {
  const { textSize } = useAppPreferences();
  const scaledStyle = scaleTextStyle(props.style, textSizeScale(textSize));
  return (
    <NativeText
      allowFontScaling
      {...props}
      style={[props.style, scaledStyle]}
    >
      {children}
    </NativeText>
  );
}
