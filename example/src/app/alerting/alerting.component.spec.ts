import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AlertingComponent } from './alerting.component';

describe('AlertingComponent', () => {
  let component: AlertingComponent;
  let fixture: ComponentFixture<AlertingComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AlertingComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AlertingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
