import { useEffect, useRef, useState } from 'react';
import type { ActiveCallState, Task, CallType } from '../types';
import { audioService } from '../services/audioService';
import { hapticService } from '../services/hapticService';
import { voiceCallService } from '../services/voiceCallService';

export function useVoiceCall(tasks: Task[], userName: string, voice: string, scope: string) {
  const [callState, setCallState] = useState<ActiveCallState>('idle');
  const currentState = useRef<ActiveCallState>('idle');
  const transition = (state: ActiveCallState) => { currentState.current = state; setCallState(state); };
  const [callType, setCallType] = useState<CallType>('morning_brief');
  const stop = () => { audioService.stopIncomingRingtone(); audioService.stopSpeaking(); hapticService.callEnd(); voiceCallService.clear(); };
  useEffect(() => { stop(); transition('idle'); return stop; }, [scope]);
  return {
    callState,
    callType,
    triggerCall: (label = 'AI Briefing', type: CallType = 'morning_brief') => {
      if (currentState.current !== 'idle') return;
      setCallType(type);
      transition('ringing'); audioService.startIncomingRingtone(); hapticService.startIncomingCallVibration();
      void voiceCallService.prepareCall(tasks, userName, voice, type);
    },
    answerCall: () => { audioService.stopIncomingRingtone(); hapticService.stopIncomingCallVibration(); audioService.playConnectChime(); hapticService.callAnswer(); transition('connected'); },
    endCall: () => { stop(); audioService.playDisconnectTone(); transition('idle'); },
    declineCall: () => { stop(); transition('idle'); },
  };
}
