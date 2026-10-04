import {allocatePayments} from './payments';
const at=new Date('2026-10-04T12:00:00Z');
describe('payment promise evidence',()=>{
 it('never uses one deposit for two promises',()=>{
  const promises=[{id:'p1',amount:300,currency:'EUR',createdAt:at},{id:'p2',amount:300,currency:'EUR',createdAt:at}];
  const paid=allocatePayments(promises,[{amount:300,currency:'EUR',at}]);expect(paid.get('p1')).toBe(300);expect(paid.get('p2')).toBe(0);
 });
 it('does not count wrong currency or earlier payments',()=>{
  const paid=allocatePayments([{id:'p1',amount:300,currency:'EUR',createdAt:at}],[{amount:300,currency:'USD',at},{amount:300,currency:'EUR',at:new Date(at.getTime()-1)}]);expect(paid.get('p1')).toBe(0);
 });
 it('combines partial deposits',()=>{
  const paid=allocatePayments([{id:'p1',amount:300,currency:'EUR',createdAt:at}],[{amount:100,currency:'EUR',at},{amount:200,currency:'EUR',at}]);expect(paid.get('p1')).toBe(300);
 });
});
