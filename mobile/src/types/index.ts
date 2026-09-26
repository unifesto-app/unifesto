// Type definitions for mobile app
// Import Event type from API
export type { Event } from '../lib/api/events';

// Registration-specific types
export type TicketType = "individual" | "group";
export type PricingModel = "perPerson" | "perGroup";
export type RegistrationStep = "ticket" | "details" | "review" | "payment";

export interface TicketOption {
  id: string;
  name: string;
  type: TicketType;
  pricingModel: PricingModel;
  price: number;
  maxQuantity: number;
  description?: string;
}

export interface AttendeeInfo {
  name: string;
  email: string;
  mobile: string;
  organization: string;
  gender: string;
}

// Navigation types
export type RootStackParamList = {
  AuthLoading: undefined;
  Login: undefined;
  SignUp: undefined;
  MainApp: undefined;
  EventDetail: { eventId: string };
  TicketDetail: { ticketId: string };
  SpacesList: undefined;
  SpaceDetail: { orgId: string };
  Profile: undefined;
  EventRegistration: { eventId: string };
  RegistrationSuccess: { eventId: string };
  Support: undefined;
};

// Tab types
export type EventTabType = "overview" | "agenda" | "speakers" | "rewards" | "sponsors" | "contact";
