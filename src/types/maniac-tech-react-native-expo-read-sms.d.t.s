declare module "@maniac-tech/react-native-expo-read-sms" {
  export function requestReadSMSPermission(): Promise<boolean>;

  export function startReadSMS(
    onSuccess: (status: unknown, sms: unknown, error: unknown) => void,
    onFailure?: (status: unknown, sms: unknown, error: unknown) => void
  ): void;
}