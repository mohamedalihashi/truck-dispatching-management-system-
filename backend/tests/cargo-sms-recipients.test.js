import { describe, expect, it } from "vitest";
import { cargoSmsRecipients } from "../services/cargoSmsService.js";

describe("cargoSmsRecipients", () => {
  const cargo = {
    customerRole: "SENDER",
    senderName: "Ali",
    senderPhone: "+252611111111",
    receiverName: "Fatima",
    receiverPhone: "+252615267625",
  };

  it("targets the receiver when customer booked as sender", () => {
    expect(cargoSmsRecipients(cargo, { prefer: "external" })).toEqual([
      { name: "Fatima", phone: "+252615267625", type: "Receiver" },
    ]);
  });

  it("targets the sender when customer booked as receiver", () => {
    expect(
      cargoSmsRecipients({ ...cargo, customerRole: "RECEIVER" }, { prefer: "external" })
    ).toEqual([{ name: "Ali", phone: "+252611111111", type: "Sender" }]);
  });

  it("includes both parties by default so the booking customer is notified", () => {
    expect(cargoSmsRecipients(cargo)).toEqual([
      { name: "Ali", phone: "+252611111111", type: "Sender" },
      { name: "Fatima", phone: "+252615267625", type: "Receiver" },
    ]);
  });
});
