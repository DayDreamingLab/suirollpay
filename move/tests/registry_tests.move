#[test_only]
module suiroll::registry_tests;
use suiroll::payroll_registry::{Self, Registry, AdminCap};
use sui::test_scenario;
use sui::sui::SUI;
fun commitment(): vector<u8> { let mut v: vector<u8> = vector[]; let mut i: u64 = 0; while (i < 32) { v.push_back(1); i = i + 1; }; v }
#[test]
fun records_payroll() { let sender=@0xA;let mut scenario=test_scenario::begin(sender);payroll_registry::init_for_testing(scenario.ctx());scenario.next_tx(sender);let mut registry=scenario.take_shared<Registry>();let cap=scenario.take_from_sender<AdminCap>();payroll_registry::record_execution<SUI>(&mut registry,&cap,commitment(),commitment(),commitment(),100,1,scenario.ctx());test_scenario::return_shared(registry);scenario.return_to_sender(cap);scenario.end(); }
#[test]
#[expected_failure(abort_code=1,location=suiroll::payroll_registry)]
fun blocks_duplicate_run() { let sender=@0xA;let mut scenario=test_scenario::begin(sender);payroll_registry::init_for_testing(scenario.ctx());scenario.next_tx(sender);let mut registry=scenario.take_shared<Registry>();let cap=scenario.take_from_sender<AdminCap>();payroll_registry::record_execution<SUI>(&mut registry,&cap,commitment(),commitment(),commitment(),100,1,scenario.ctx());payroll_registry::record_execution<SUI>(&mut registry,&cap,commitment(),commitment(),commitment(),100,1,scenario.ctx());test_scenario::return_shared(registry);scenario.return_to_sender(cap);scenario.end(); }
#[test]
#[expected_failure(abort_code=0,location=suiroll::payroll_registry)]
fun blocks_paused_payroll() { let sender=@0xA;let mut scenario=test_scenario::begin(sender);payroll_registry::init_for_testing(scenario.ctx());scenario.next_tx(sender);let mut registry=scenario.take_shared<Registry>();let cap=scenario.take_from_sender<AdminCap>();payroll_registry::pause(&mut registry,&cap);payroll_registry::record_execution<SUI>(&mut registry,&cap,commitment(),commitment(),commitment(),100,1,scenario.ctx());test_scenario::return_shared(registry);scenario.return_to_sender(cap);scenario.end(); }
