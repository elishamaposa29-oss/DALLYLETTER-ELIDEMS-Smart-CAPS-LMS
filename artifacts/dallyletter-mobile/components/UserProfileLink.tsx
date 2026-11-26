import { getApiUrl } from "@workspace/api-client-react";
import { router } from "expo-router";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Props = { userId?: number|string|null; name:string; avatarUrl?:string|null; compact?:boolean };
export function UserProfileLink({userId,name,avatarUrl,compact=false}:Props) {
  const colors=useColors();
  const {token}=useAuth();
  const validId=Number(userId);
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={"View "+name+"'s profile"} onPress={()=>{if(Number.isSafeInteger(validId)&&validId>0)router.push({pathname:"/profile/[id]",params:{id:String(validId)}} as any);}} disabled={!Number.isSafeInteger(validId)||validId<=0} style={{flexDirection:"row",alignItems:"center",gap:compact?6:9,minWidth:0}}>
    {compact?null:<View style={{width:34,height:34,borderRadius:17,overflow:"hidden",alignItems:"center",justifyContent:"center",backgroundColor:colors.secondary,borderWidth:1,borderColor:colors.border}}>{avatarUrl?<Image source={{uri:/^https:\/\//i.test(avatarUrl)?avatarUrl:getApiUrl(avatarUrl),headers:token?{Authorization:"Bearer "+token}:{}}} style={{width:34,height:34}} resizeMode="cover"/>:<Text style={{fontSize:13,fontWeight:"700",color:colors.primary}}>{name.slice(0,1).toUpperCase()}</Text>}</View>}
    <Text numberOfLines={1} style={{flexShrink:1,fontSize:13,fontWeight:"600",color:colors.foreground}}>{name}</Text>
  </TouchableOpacity>;
}
