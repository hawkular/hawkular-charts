import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AvailComponent } from './avail.component';

describe('AvailComponent', () => {
  let component: AvailComponent;
  let fixture: ComponentFixture<AvailComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AvailComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AvailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
