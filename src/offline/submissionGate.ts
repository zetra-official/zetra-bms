// Local submission safety only; does not assert database idempotency.
export class SubmissionGate {
  private state: "READY" | "IN_FLIGHT" | "REVIEW" | "COMPLETE" = "READY";
  begin(): boolean {
    if (this.state !== "READY") return false;
    this.state = "IN_FLIGHT"; return true;
  }
  dispatched(): void { this.state = "REVIEW"; }
  committed(): void { this.state = "COMPLETE"; }
  release(): void { if (this.state === "IN_FLIGHT") this.state = "READY"; }
  get blocked(): boolean { return this.state === "REVIEW" || this.state === "COMPLETE"; }
  get committedSale(): boolean { return this.state === "COMPLETE"; }
}
