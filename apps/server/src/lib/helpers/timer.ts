class Timer {
  private startTime: number;
  private steps: { [key: string]: number } = {};

  constructor() {
    this.startTime = Date.now();
  }

  step(name: string): void {
    this.steps[name] = Date.now() - this.startTime;
  }

  getTimings(): { [key: string]: number } {
    return {
      ...this.steps,
      total: Date.now() - this.startTime,
    };
  }
}

export default Timer;
