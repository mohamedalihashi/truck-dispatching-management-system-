import { describe, expect, it } from "vitest";
import { cargoSmsRecipients, formatAssignedTruckLine } from "../services/cargoSmsService.js";

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

describe("formatAssignedTruckLine", () => {
  it("includes driver name before truck plate for assignment SMS", () => {
    expect(
      formatAssignedTruckLine({
        driverName: "Axmed",
        truckType: "Box truck",
        truckNumber: "TRK-12",
        plateNumber: "SO-1234",
      })
    ).toBe(
      " Darawalka: Axmed. Nooca gaariga: Box truck. Taargada: SO-1234. Gaari: TRK-12."
    );
  });

  it("falls back when plate equals truck number", () => {
    expect(
      formatAssignedTruckLine({
        truckType: "Flatbed",
        truckNumber: "SO-99",
        plateNumber: "SO-99",
      })
    ).toBe(" Darawalka: Darawal. Nooca gaariga: Flatbed. Taargada: SO-99.");
  });
});
