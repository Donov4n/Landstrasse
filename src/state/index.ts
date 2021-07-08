export type StateTransitionFunction<EState, TArgs> = (args: TArgs) => EState | null;
export type TransitionMap<EState, TArgs> = Map<EState, StateTransitionFunction<EState, TArgs>>;

class StateMachine<EState, TArgs> {
    private currentState: EState;

    private readonly transitionMap: TransitionMap<EState, TArgs>;

    public get current(): EState {
        return this.currentState;
    }

    constructor(initialState: EState, transitionMap: TransitionMap<EState, TArgs>) {
        this.currentState = initialState;
        this.transitionMap = transitionMap;
    }

    public update(args: TArgs) {
        const stateTransition = this.transitionMap.get(this.currentState);
        if (!stateTransition) {
            return;
        }
        this.currentState = stateTransition(args) || this.currentState;
    }
}

export default StateMachine;
