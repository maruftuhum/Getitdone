class HapticService {
  private callVibrateInterval: number | null = null;
  private isVibratingCall: boolean = false;

  private isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  // Safe wrapper for navigator.vibrate
  public vibrate(pattern: number | number[]): boolean {
    if (!this.isSupported()) return false;
    try {
      return navigator.vibrate(pattern);
    } catch (e) {
      return false;
    }
  }

  // Light, satisfying haptic on task completion (subtle celebratory double-pulse)
  public taskComplete(): void {
    this.vibrate([28, 45, 40]);
  }

  // Soft single micro-tap when unchecking a task
  public taskUncheck(): void {
    this.vibrate(18);
  }

  // Crisp confirmation when a task is created or added
  public taskCreate(): void {
    this.vibrate([35, 30, 45]);
  }

  // Distinct warning pulse on task deletion
  public taskDelete(): void {
    this.vibrate([60, 50, 75]);
  }

  // Subtle tap feedback for UI buttons and mic toggle
  public lightTap(): void {
    this.vibrate(15);
  }

  // Distinct, rhythmic phone ring vibration pattern for incoming AI calls
  // (Pulsing ring cadence: 450ms on, 200ms off, 450ms on, 1900ms pause)
  public startIncomingCallVibration(): void {
    if (this.isVibratingCall) return;
    this.isVibratingCall = true;

    const ringPattern = [450, 200, 450, 1900];
    this.vibrate(ringPattern);

    // Repeat pattern every 3 seconds to sync with phone ringtone cycle
    this.callVibrateInterval = window.setInterval(() => {
      if (!this.isVibratingCall) return;
      this.vibrate(ringPattern);
    }, 3000);
  }

  // Cancel incoming call vibration
  public stopIncomingCallVibration(): void {
    this.isVibratingCall = false;
    if (this.callVibrateInterval) {
      clearInterval(this.callVibrateInterval);
      this.callVibrateInterval = null;
    }
    this.vibrate(0);
  }

  // Distinct pickup chime haptic when user answers the call
  public callAnswer(): void {
    this.stopIncomingCallVibration();
    this.vibrate([50, 30, 80]);
  }

  // Disconnect haptic when call ends or is declined
  public callEnd(): void {
    this.stopIncomingCallVibration();
    this.vibrate([100, 60, 60]);
  }

  // Urgent notification haptic for scheduled alarms
  public alarmAlert(): void {
    this.vibrate([250, 100, 250, 100, 400]);
  }
}

export const hapticService = new HapticService();
