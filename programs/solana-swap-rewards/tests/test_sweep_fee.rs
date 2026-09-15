use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::Instruction,
        InstructionData, ToAccountMetas,
    },
    anchor_spl::token::spl_token,
    anchor_lang::solana_program::program_pack::Pack,
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

#[test]
fn test_sweep_fee_pays_founder_in_full() {
    let program_id = solana_swap_rewards::id();
    let payer = Keypair::new();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/solana_swap_rewards.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    let mint = CreateMint::new(&mut svm, &payer).decimals(6).send().unwrap();

    let (fee_vault_authority, _) = Pubkey::find_program_address(
        &[solana_swap_rewards::constants::FEE_VAULT_AUTHORITY_SEED],
        &program_id,
    );
    let fee_token_account = CreateAssociatedTokenAccount::new(&mut svm, &payer, &mint)
        .owner(&fee_vault_authority)
        .send()
        .unwrap();
    MintTo::new(&mut svm, &payer, &mint, &fee_token_account, 10_000)
        .send()
        .unwrap();

    let founder = solana_swap_rewards::constants::FOUNDER_AUTHORITY;
    let founder_token_account = CreateAssociatedTokenAccount::new(&mut svm, &payer, &mint)
        .owner(&founder)
        .send()
        .unwrap();

    let ix = Instruction::new_with_bytes(
        program_id,
        &solana_swap_rewards::instruction::SweepFee {}.data(),
        solana_swap_rewards::accounts::SweepFee {
            caller: payer.pubkey(),
            mint,
            fee_vault_authority,
            fee_token_account,
            founder_authority: founder,
            founder_token_account,
            token_program: spl_token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "sweep tx failed: {:?}", res.err());

    let fee_acc = svm.get_account(&fee_token_account).unwrap();
    let fee_token = spl_token::state::Account::unpack(&fee_acc.data).unwrap();
    assert_eq!(fee_token.amount, 0, "fee account should be fully swept");

    let founder_acc = svm.get_account(&founder_token_account).unwrap();
    let founder_token = spl_token::state::Account::unpack(&founder_acc.data).unwrap();
    assert_eq!(founder_token.amount, 10_000, "founder should get the full amount, no pool split anymore");
}
