type MessageTime = { createdAt: Date; direction: string };
type ConversationTimes = { messages: MessageTime[] };

/** Only successful sends count as replies. The caller filters their statuses. */
export function replyCoaching(conversations: ConversationTimes[], now: Date, slaMinutes = 10) {
  const waiting = conversations.flatMap((conversation) => {
    const latest = conversation.messages[0];
    return latest?.direction === 'INBOUND' ? [latest.createdAt] : [];
  });
  if (!waiting.length) return null;
  const waitingSince = new Date(Math.min(...waiting.map((time) => time.getTime())));
  const waitingMinutes = Math.max(0, Math.floor((now.getTime() - waitingSince.getTime()) / 60_000));
  return {
    ruleKey: 'PATIENT_WAITING',
    severity: waitingMinutes >= slaMinutes ? 'RED' : 'ORANGE',
    waitingSince,
    waitingMinutes,
    slaMinutes,
    title: waitingMinutes >= slaMinutes ? 'Patient reply overdue' : 'Patient waiting for a reply',
    reason: 'The patient sent a message and no successful reply is recorded in that conversation.',
    recommendedAction:
      'Open the inbox, read the patient’s message, and reply now. A failed send does not count as a reply.',
  };
}
