"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappContactPhone = whatsappContactPhone;
/** A WhatsApp LID/group identifier is never a telephone number. */
function whatsappContactPhone(threadId) {
    if (!threadId)
        return undefined;
    const match = /^(\+?[1-9]\d{6,14})(?:@(s\.whatsapp\.net|c\.us))?$/.exec(threadId);
    return match ? `+${match[1].replace(/^\+/, '')}` : undefined;
}
//# sourceMappingURL=whatsapp-contact.js.map