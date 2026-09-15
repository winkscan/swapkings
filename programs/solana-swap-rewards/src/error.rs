use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the counter authority can update this counter")]
    Unauthorized,
    #[msg("Counter has reached the maximum value")]
    CounterOverflow,
    #[msg("Fee amount is below the minimum allowed")]
    FeeTooSmall,
    #[msg("Rank volume overflowed")]
    VolumeOverflow,
    #[msg("House fee total overflowed")]
    FeeOverflow,
    #[msg("House account does not match the depositor's current house")]
    GuildMismatch,
    #[msg("Switching houses requires passing the previous house account")]
    MissingPreviousGuild,
    #[msg("This wallet is not currently in a house")]
    NotInGuild,
    #[msg("This wallet has already claimed a referral code")]
    ReferralCodeAlreadyClaimed,
    #[msg("Missing or invalid founder attestation for this house")]
    MissingFounderAttestation,
    #[msg("Reported swap volume exceeds the per-swap maximum")]
    UsdCentsTooLarge,
}
