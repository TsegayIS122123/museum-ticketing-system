import { TicketCard } from './TicketCard';

export function BookingCard(props: React.ComponentProps<typeof TicketCard>) {
  return <TicketCard {...props} />;
}
