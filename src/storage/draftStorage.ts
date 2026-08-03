import type { ChatMessage, Settings } from '../types';
const key='intervention-draft-v1'; export const loadDraft=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}') as {messages?:ChatMessage[];report?:string;settings?:Settings}}catch{return {}}}; export const saveDraft=(value:unknown)=>localStorage.setItem(key,JSON.stringify(value)); export const clearStorage=()=>localStorage.clear();
