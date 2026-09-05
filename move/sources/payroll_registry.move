/// Reference registry implementation matching the deployed module's public ABI.
/// Settlement transfers are constructed and verified in the SAME transaction block.
module suiroll::payroll_registry;
use sui::table::{Self, Table};
use sui::event;
public struct AdminCap has key, store { id: UID }
public struct Registry has key { id: UID, paused: bool, executed_runs: Table<vector<u8>, vector<u8>> }
public struct PayrollExecuted<phantom T> has copy, drop { organization_hash: vector<u8>, run_hash: vector<u8>, plan_hash: vector<u8>, total_amount: u64, recipient_count: u64, executor: address }
const EPaused: u64 = 0;
const EDuplicateRun: u64 = 1;
const EInvalidCommitment: u64 = 2;
const EEmptyPayroll: u64 = 3;
fun init(ctx: &mut TxContext) { transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender()); transfer::share_object(Registry { id: object::new(ctx), paused: false, executed_runs: table::new(ctx) }); }
public fun pause(registry: &mut Registry, _: &AdminCap) { registry.paused = true; }
public fun unpause(registry: &mut Registry, _: &AdminCap) { registry.paused = false; }
public fun record_execution<T>(registry: &mut Registry, _: &AdminCap, organization_hash: vector<u8>, run_hash: vector<u8>, plan_hash: vector<u8>, total_amount: u64, recipient_count: u64, ctx: &mut TxContext) {
 assert!(!registry.paused, EPaused);
 assert!(organization_hash.length() == 32 && run_hash.length() == 32 && plan_hash.length() == 32, EInvalidCommitment);
 assert!(total_amount > 0 && recipient_count > 0, EEmptyPayroll);
 assert!(!registry.executed_runs.contains(run_hash), EDuplicateRun);
 registry.executed_runs.add(run_hash, plan_hash);
 event::emit(PayrollExecuted<T> { organization_hash, run_hash, plan_hash, total_amount, recipient_count, executor: ctx.sender() });
}
#[test_only] public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }
