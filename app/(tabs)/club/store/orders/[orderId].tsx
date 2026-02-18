import { Redirect, useLocalSearchParams } from "expo-router";
export default function StoreDetailAlias() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <Redirect href={"/(tabs)/club/orders/" + (orderId ?? "")} />;
}
