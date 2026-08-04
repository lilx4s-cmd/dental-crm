"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTwoFactorChallenge = isTwoFactorChallenge;
function isTwoFactorChallenge(result) {
    return 'twoFactorRequired' in result;
}
//# sourceMappingURL=user.types.js.map