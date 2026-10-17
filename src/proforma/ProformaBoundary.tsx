import React from 'react';
import {View,Text} from 'react-native';
import {Button} from '../ui/Button';
export class ProformaBoundary extends React.Component<{children:React.ReactNode;failed:string;retry:string},{failed:boolean;attempt:number}>{
 state={failed:false,attempt:0};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:Error){console.error('PROFORMA_RENDER_FAILURE',error.name,error.message)}
 render(){return this.state.failed?<View style={{flex:1,padding:20,gap:14,backgroundColor:'#fff'}}><Text accessibilityRole="alert" style={{color:'#A52B36',lineHeight:22}}>{this.props.failed}</Text><Button title={this.props.retry} onPress={()=>this.setState(s=>({failed:false,attempt:s.attempt+1}))}/></View>:<React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>}
}
