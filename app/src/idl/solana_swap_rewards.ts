/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/solana_swap_rewards.json`.
 */
export type SolanaSwapRewards = {
  "address": "C84oAsWU1whcVLNz2555DP12fBmE116LAiUYsCdkmwaD",
  "metadata": {
    "name": "solanaSwapRewards",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "claimReferralCode",
      "discriminator": [
        182,
        240,
        222,
        92,
        161,
        217,
        184,
        228
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "referralCode",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  102,
                  95,
                  99,
                  111,
                  100,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "code"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "code",
          "type": {
            "array": [
              "u8",
              7
            ]
          }
        }
      ]
    },
    {
      "name": "increment",
      "discriminator": [
        11,
        18,
        104,
        9,
        104,
        174,
        59,
        33
      ],
      "accounts": [
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinGuild",
      "discriminator": [
        242,
        159,
        183,
        21,
        140,
        65,
        110,
        73
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "guild",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  105,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ]
          }
        },
        {
          "name": "previousGuild",
          "writable": true,
          "optional": true
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "attestation instruction — pinned to the real Instructions sysvar",
            "address, never any other account."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tokenMint",
          "type": "pubkey"
        },
        {
          "name": "founderWallet",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "leaveGuild",
      "discriminator": [
        32,
        129,
        72,
        117,
        154,
        8,
        115,
        245
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "guild",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "migratePlayerStats",
      "discriminator": [
        96,
        209,
        44,
        229,
        146,
        12,
        180,
        3
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerStats",
          "docs": [
            "Intentionally not a typed Account — see the module doc comment above."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "depositor",
          "docs": [
            "written directly, doesn't even need to sign."
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "recordSwap",
      "discriminator": [
        164,
        158,
        148,
        54,
        167,
        137,
        171,
        59
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "depositorFeeTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "feeVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "feeVaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "guildFiller",
          "docs": [
            "be distinct from fee_vault_authority and referrer_filler (see",
            "constants.rs's own comment on GUILD_FILLER_SEED for why: reusing",
            "fee_vault_authority here used to collapse three separate token",
            "accounts into one and crash every swap with no guild/no referrer)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  105,
                  108,
                  100,
                  95,
                  102,
                  105,
                  108,
                  108,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "guildFounderWallet",
          "docs": [
            "is joined, or guild_filler as inert filler before any guild is joined —",
            "the handler only ever transfers to this account when current_guild is",
            "actually set, so the filler case never gets paid regardless of what's",
            "passed."
          ]
        },
        {
          "name": "guildFounderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "guildFounderWallet"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "referrerFiller",
          "docs": [
            "deliberately a DIFFERENT seed from guild_filler; see that field's own",
            "comment for why they can't share one."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  102,
                  101,
                  114,
                  114,
                  101,
                  114,
                  95,
                  102,
                  105,
                  108,
                  108,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "referrerWallet",
          "docs": [
            "referrer_arg this very call is about to set it to for the first time",
            "(see handle_record_swap's referrer-assignment guard below), OR",
            "referrer_filler as inert filler when neither applies. The referrer_arg",
            "branch is required because Anchor validates every account constraint",
            "BEFORE the handler body runs — reading only player_stats.referrer here",
            "would still see the pre-call default value on a wallet's very first",
            "swap after following a referral link, misdirecting that swap's own",
            "referrer payout into referrer_filler instead of the real referrer",
            "(confirmed against a real mainnet transaction, 2026-08-22 — the payout",
            "landed at the referrer_filler PDA instead of the referrer's wallet).",
            "Mirrors the handler's own `referrer_arg != Pubkey::default() &&",
            "referrer_arg != depositor_key` guard so a self-referral attempt still",
            "falls through to the filler here too."
          ]
        },
        {
          "name": "referrerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "referrerWallet"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "guild",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "usdCents",
          "type": "u64"
        },
        {
          "name": "feeAmount",
          "type": "u64"
        },
        {
          "name": "feeUsdE4",
          "type": "u64"
        },
        {
          "name": "referrerArg",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "resetGuildMembership",
      "discriminator": [
        17,
        100,
        50,
        51,
        190,
        87,
        122,
        105
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "address": "CJkDGjo7TdHdLgK3hyLkeSCgaYgoreh2DoUS9qupQuvf"
        },
        {
          "name": "depositor",
          "docs": [
            "written directly, doesn't need to sign (the gate is on `authority`)."
          ]
        },
        {
          "name": "playerStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "sweepFee",
      "discriminator": [
        13,
        53,
        93,
        89,
        43,
        177,
        127,
        31
      ],
      "accounts": [
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "feeVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "feeTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeVaultAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "founderAuthority",
          "docs": [
            "FOUNDER_AUTHORITY constant so it can't be swapped for anyone else's."
          ],
          "address": "CJkDGjo7TdHdLgK3hyLkeSCgaYgoreh2DoUS9qupQuvf"
        },
        {
          "name": "founderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "founderAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "sweepLegacyPool",
      "discriminator": [
        48,
        31,
        5,
        203,
        159,
        185,
        240,
        76
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "address": "CJkDGjo7TdHdLgK3hyLkeSCgaYgoreh2DoUS9qupQuvf"
        },
        {
          "name": "mint"
        },
        {
          "name": "poolVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "poolVaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poolVaultAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "authorityTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "counter",
      "discriminator": [
        255,
        176,
        4,
        245,
        188,
        253,
        124,
        25
      ]
    },
    {
      "name": "guild",
      "discriminator": [
        74,
        176,
        57,
        164,
        195,
        188,
        156,
        237
      ]
    },
    {
      "name": "playerStats",
      "discriminator": [
        169,
        146,
        242,
        176,
        102,
        118,
        231,
        172
      ]
    },
    {
      "name": "referralCode",
      "discriminator": [
        227,
        239,
        247,
        224,
        128,
        187,
        44,
        229
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the counter authority can update this counter"
    },
    {
      "code": 6001,
      "name": "counterOverflow",
      "msg": "Counter has reached the maximum value"
    },
    {
      "code": 6002,
      "name": "feeTooSmall",
      "msg": "Fee amount is below the minimum allowed"
    },
    {
      "code": 6003,
      "name": "volumeOverflow",
      "msg": "Rank volume overflowed"
    },
    {
      "code": 6004,
      "name": "feeOverflow",
      "msg": "House fee total overflowed"
    },
    {
      "code": 6005,
      "name": "guildMismatch",
      "msg": "House account does not match the depositor's current house"
    },
    {
      "code": 6006,
      "name": "missingPreviousGuild",
      "msg": "Switching houses requires passing the previous house account"
    },
    {
      "code": 6007,
      "name": "notInGuild",
      "msg": "This wallet is not currently in a house"
    },
    {
      "code": 6008,
      "name": "referralCodeAlreadyClaimed",
      "msg": "This wallet has already claimed a referral code"
    },
    {
      "code": 6009,
      "name": "missingFounderAttestation",
      "msg": "Missing or invalid founder attestation for this house"
    },
    {
      "code": 6010,
      "name": "usdCentsTooLarge",
      "msg": "Reported swap volume exceeds the per-swap maximum"
    }
  ],
  "types": [
    {
      "name": "counter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "guild",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "founderWallet",
            "type": "pubkey"
          },
          {
            "name": "memberCount",
            "type": "u64"
          },
          {
            "name": "totalFeesEarnedUsdE4",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "playerStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "cumulativeVolumeCents",
            "type": "u64"
          },
          {
            "name": "currentGuild",
            "type": "pubkey"
          },
          {
            "name": "currentGuildFounderWallet",
            "type": "pubkey"
          },
          {
            "name": "referrer",
            "type": "pubkey"
          },
          {
            "name": "myReferralCode",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "earnedForReferrerUsdE4",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "referralCode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "attestationSigner",
      "type": "pubkey",
      "value": "HdiEzJP1eS2dmqbo8F1xZpnBTjDLhMZELJXMbwaasr2s"
    },
    {
      "name": "counterSeed",
      "type": "bytes",
      "value": "[99, 111, 117, 110, 116, 101, 114]"
    },
    {
      "name": "feeVaultAuthoritySeed",
      "type": "bytes",
      "value": "[102, 101, 101, 95, 118, 97, 117, 108, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "founderAuthority",
      "type": "pubkey",
      "value": "CJkDGjo7TdHdLgK3hyLkeSCgaYgoreh2DoUS9qupQuvf"
    },
    {
      "name": "guildFillerSeed",
      "type": "bytes",
      "value": "[103, 117, 105, 108, 100, 95, 102, 105, 108, 108, 101, 114]"
    },
    {
      "name": "guildFounderShareBps",
      "type": "u64",
      "value": "9000"
    },
    {
      "name": "guildFounderShareWithRefBps",
      "type": "u64",
      "value": "4000"
    },
    {
      "name": "guildSeed",
      "type": "bytes",
      "value": "[103, 117, 105, 108, 100]"
    },
    {
      "name": "helloWorldLamports",
      "type": "u64",
      "value": "1"
    },
    {
      "name": "maxCount",
      "type": "u64",
      "value": "10"
    },
    {
      "name": "maxFeeUsdE4PerSwap",
      "type": "u64",
      "value": "10000000000"
    },
    {
      "name": "maxUsdCentsPerSwap",
      "type": "u64",
      "value": "5000000000"
    },
    {
      "name": "minFeeAmount",
      "type": "u64",
      "value": "1000"
    },
    {
      "name": "playerStatsSeed",
      "type": "bytes",
      "value": "[112, 108, 97, 121, 101, 114, 95, 115, 116, 97, 116, 115]"
    },
    {
      "name": "referrerFillerSeed",
      "type": "bytes",
      "value": "[114, 101, 102, 101, 114, 114, 101, 114, 95, 102, 105, 108, 108, 101, 114]"
    },
    {
      "name": "referrerShareNoGuildBps",
      "type": "u64",
      "value": "5000"
    },
    {
      "name": "referrerShareWithGuildBps",
      "type": "u64",
      "value": "5000"
    },
    {
      "name": "refCodeSeed",
      "type": "bytes",
      "value": "[114, 101, 102, 95, 99, 111, 100, 101]"
    },
    {
      "name": "tierDegenScore",
      "type": "u64",
      "value": "224"
    },
    {
      "name": "tierDolphinDiscountBps",
      "type": "u64",
      "value": "1250"
    },
    {
      "name": "tierKrakenDiscountBps",
      "type": "u64",
      "value": "5000"
    },
    {
      "name": "tierSharkDiscountBps",
      "type": "u64",
      "value": "2500"
    },
    {
      "name": "tierSharkScore",
      "type": "u64",
      "value": "708"
    },
    {
      "name": "tierTraderScore",
      "type": "u64",
      "value": "71"
    },
    {
      "name": "tierWhaleDiscountBps",
      "type": "u64",
      "value": "3750"
    },
    {
      "name": "tierWhaleScore",
      "type": "u64",
      "value": "2237"
    },
    {
      "name": "vaultAuthoritySeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    }
  ]
};
